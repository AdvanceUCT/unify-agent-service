import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AppError } from '../../errors'
import { ActivationStore, hashActivationToken, type StoredActivationRecord } from '../activationStore'
import { WalletActivationService } from '../walletActivationService'

const now = new Date('2027-04-27T10:00:00Z')

async function makeStore() {
  const dir = await mkdtemp(join(tmpdir(), 'unify-activation-store-'))
  const store = new ActivationStore(join(dir, 'activations.json'))

  return {
    dir,
    store,
  }
}

function storedActivation(overrides: Partial<StoredActivationRecord> = {}): StoredActivationRecord {
  return {
    activationId: 'activation-001',
    createdAt: now.toISOString(),
    credentialExchangeId: 'credential-exchange-001',
    expiresAt: '2027-04-28T10:00:00.000Z',
    invitationId: 'unify-oob-001',
    invitationUrl: 'https://issuer.example.test/oob?oob=encoded-invitation',
    issuerLabel: 'UNIFY Issuer Service',
    tokenHash: hashActivationToken('real-token'),
    ...overrides,
  }
}

describe('WalletActivationService', () => {
  let tempDir: string | undefined

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true })
    }
    tempDir = undefined
  })

  it('resolves a stored activation token', async () => {
    const { dir, store } = await makeStore()
    tempDir = dir
    await store.save(storedActivation())
    const service = new WalletActivationService({} as never, store)

    await expect(service.resolve({ token: 'real-token' })).resolves.toMatchObject({
      activationId: 'activation-001',
      activationSource: 'token',
      credentialExchangeId: 'credential-exchange-001',
      expiresAt: '2027-04-28T10:00:00.000Z',
      invitationUrl: 'https://issuer.example.test/oob?oob=encoded-invitation',
      issuerLabel: 'UNIFY Issuer Service',
    })
  })

  it('rejects unknown and expired tokens', async () => {
    const { dir, store } = await makeStore()
    tempDir = dir
    await store.save(
      storedActivation({
        activationId: 'expired',
        expiresAt: '2026-04-27T09:00:00.000Z',
        tokenHash: hashActivationToken('expired-token'),
      }),
    )
    const service = new WalletActivationService({} as never, store)

    const unknown = await service.resolve({ token: 'missing-token' }).catch((error) => error)
    const expired = await service.resolve({ token: 'expired-token' }).catch((error) => error)

    expect(unknown).toBeInstanceOf(AppError)
    expect((unknown as AppError).status).toBe(404)
    expect(expired).toBeInstanceOf(AppError)
    expect((expired as AppError).status).toBe(410)
  })
})
