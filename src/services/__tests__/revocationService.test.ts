import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { AppError } from '../../errors'
import { CredentialLifecycleStore, type CredentialLifecycleRecord } from '../credentialLifecycleStore'
import { RevocationService } from '../revocationService'

function activeRecord(): CredentialLifecycleRecord {
  return {
    credentialExchangeId: 'exchange-1',
    credentialRevocationId: '7',
    revocationRegistryDefinitionId: 'rev-reg-1',
    status: 'ACTIVE',
    revision: 0,
    eventId: 'lifecycle-baseline:exchange-1',
    updatedAt: '2026-07-08T10:00:00.000Z',
  }
}

function makeAgent(updateResult?: unknown) {
  return {
    modules: {
      anoncreds: {
        getRevocationRegistryDefinition: jest.fn().mockResolvedValue({
          revocationRegistryDefinition: { issuerId: 'did:indy:bcovrin:test:issuer' },
        }),
        updateRevocationStatusList: jest.fn().mockResolvedValue(
          updateResult ?? {
            revocationStatusListState: {
              state: 'finished',
              revocationStatusList: { timestamp: 1_720_000_000 },
            },
          },
        ),
      },
    },
  }
}

describe('RevocationService', () => {
  let directory: string
  let store: CredentialLifecycleStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'unify-lifecycle-'))
    store = new CredentialLifecycleStore(join(directory, 'lifecycle.json'))
  })

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  it('suspends an active credential by publishing its index as revoked', async () => {
    const agent = makeAgent()
    const webhook = jest.fn().mockResolvedValue(undefined)
    await store.save(activeRecord())

    const result = await new RevocationService(agent as never, store, webhook).suspend({
      credentialExchangeId: 'exchange-1',
      reason: 'Enrolment review',
    })

    expect(result.status).toBe('SUSPENDED')
    expect(result.suspendedAt).toBeDefined()
    expect(agent.modules.anoncreds.updateRevocationStatusList).toHaveBeenCalledWith(
      expect.objectContaining({
        revocationStatusList: {
          revocationRegistryDefinitionId: 'rev-reg-1',
          revokedCredentialIndexes: [7],
        },
      }),
    )
    expect(webhook).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUSPENDED' }))
  })

  it('reactivates a suspended credential by moving its index back to issued', async () => {
    const agent = makeAgent()
    await store.save({ ...activeRecord(), status: 'SUSPENDED', suspendedAt: '2026-07-08T10:05:00.000Z' })

    const result = await new RevocationService(agent as never, store, jest.fn()).reactivate({
      credentialExchangeId: 'exchange-1',
      reason: 'Review completed',
    })

    expect(result.status).toBe('ACTIVE')
    expect(result.reactivatedAt).toBeDefined()
    expect(agent.modules.anoncreds.updateRevocationStatusList).toHaveBeenCalledWith(
      expect.objectContaining({
        revocationStatusList: {
          issuedCredentialIndexes: [7],
          revocationRegistryDefinitionId: 'rev-reg-1',
        },
      }),
    )
  })

  it('marks an already suspended credential permanently revoked without a second ledger write', async () => {
    const agent = makeAgent()
    await store.save({ ...activeRecord(), status: 'SUSPENDED', suspendedAt: '2026-07-08T10:05:00.000Z' })

    const result = await new RevocationService(agent as never, store, jest.fn()).revoke({
      credentialExchangeId: 'exchange-1',
      reason: 'Student withdrawn',
    })

    expect(result.status).toBe('REVOKED')
    expect(result.revokedAt).toBeDefined()
    expect(agent.modules.anoncreds.updateRevocationStatusList).not.toHaveBeenCalled()
  })

  it('never reactivates a permanently revoked credential', async () => {
    await store.save({ ...activeRecord(), status: 'REVOKED', revokedAt: '2026-07-08T10:05:00.000Z' })
    const service = new RevocationService(makeAgent() as never, store, jest.fn())

    const error = await service.reactivate({ credentialExchangeId: 'exchange-1' }).catch((caught) => caught)

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(409)
    expect((error as AppError).code).toBe('CREDENTIAL_REVOKED')
  })

  it('persists revisions and stable event identity across retries and restart', async () => {
    const agent = makeAgent()
    const webhook = jest.fn()
    await store.save(activeRecord())
    const service = new RevocationService(agent as never, store, webhook)
    const first = await service.suspend({ credentialExchangeId: 'exchange-1' })
    expect(first.revision).toBe(1)
    expect(webhook).toHaveBeenCalledWith(expect.objectContaining({ revision: 1, eventId: first.eventId }))
    const restarted = new RevocationService(agent as never, new CredentialLifecycleStore(join(directory, 'lifecycle.json')), webhook)
    expect(await restarted.suspend({ credentialExchangeId: 'exchange-1' })).toEqual(first)
    expect((await restarted.reactivate({ credentialExchangeId: 'exchange-1' })).revision).toBe(2)
    expect(agent.modules.anoncreds.updateRevocationStatusList).toHaveBeenCalledTimes(2)
  })

  it('rejects a stale scheduled revision before touching the ledger', async () => {
    const agent = makeAgent()
    await store.save({ ...activeRecord(), status: 'SUSPENDED', revision: 3, eventId: 'suspension-3' })
    await expect(new RevocationService(agent as never, store, jest.fn()).reactivate({ credentialExchangeId: 'exchange-1', expectedRevision: 1 })).rejects.toMatchObject({ status: 409, code: 'LIFECYCLE_REVISION_CONFLICT' })
    expect(agent.modules.anoncreds.updateRevocationStatusList).not.toHaveBeenCalled()
  })

  it('migrates historical records to stable baseline identity without changing status', async () => {
    const legacy = { ...activeRecord(), status: 'SUSPENDED' as const, revision: undefined, eventId: undefined }
    await store.save(legacy)
    const first = await store.findByCredentialExchangeId('exchange-1')
    const restarted = new CredentialLifecycleStore(join(directory, 'lifecycle.json'))
    expect(await restarted.findByCredentialExchangeId('exchange-1')).toEqual(first)
    expect(first).toMatchObject({ status: 'SUSPENDED', revision: 0, eventId: 'lifecycle-baseline:exchange-1' })
  })

  it('does not change local state when the ledger update fails', async () => {
    const agent = makeAgent({
      revocationStatusListState: { state: 'failed', reason: 'ledger unavailable' },
    })
    await store.save(activeRecord())

    const error = await new RevocationService(agent as never, store, jest.fn())
      .suspend({ credentialExchangeId: 'exchange-1' })
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('REVOCATION_UPDATE_FAILED')
    await expect(store.findByCredentialExchangeId('exchange-1')).resolves.toEqual(activeRecord())
  })
})
