import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { VerificationStore } from '../verificationStore'
import type { ServicePointRecord, VerificationSessionRecord } from '../verificationTypes'

function servicePoint(index: number): ServicePointRecord {
  return {
    id: `service-point-${index}`,
    publicId: `public-${index}`,
    vendorId: 'vendor-001',
    vendorName: 'Library Cafe',
    externalId: `counter-${index}`,
    name: `Counter ${index}`,
    active: true,
    createdAt: '2026-06-23T10:00:00.000Z',
    updatedAt: '2026-06-23T10:00:00.000Z',
  }
}

function session(index: number): VerificationSessionRecord {
  return {
    verificationRequestId: `verification-${index}`,
    proofRecordId: `proof-${index}`,
    outOfBandId: `oob-${index}`,
    servicePointId: 'service-point-1',
    clientRequestId: `client-${index}`,
    createdAt: '2026-06-23T10:00:00.000Z',
    updatedAt: '2026-06-23T10:00:00.000Z',
    expiresAt: '2026-06-23T10:05:00.000Z',
    state: 'request-sent',
    decision: 'Pending',
  }
}

describe('VerificationStore', () => {
  let directory: string
  let filePath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'unify-verification-store-'))
    filePath = join(directory, 'verification.json')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('serializes concurrent writes without losing service points or sessions', async () => {
    const store = new VerificationStore(filePath)
    await Promise.all(Array.from({ length: 10 }, (_, index) => store.insertServicePoint(servicePoint(index))))
    await store.insertServicePoint(servicePoint(10))
    await Promise.all(Array.from({ length: 10 }, (_, index) => store.insertSession(session(index))))

    expect(await store.listServicePoints()).toHaveLength(11)
    expect(await store.listSessions()).toHaveLength(10)
  })

  it('persists records across store instances', async () => {
    const first = new VerificationStore(filePath)
    await first.insertServicePoint(servicePoint(1))
    await first.insertSession(session(1))

    const reopened = new VerificationStore(filePath)
    await expect(reopened.findServicePointByPublicId('public-1')).resolves.toMatchObject({ id: 'service-point-1' })
    await expect(reopened.findSessionByProofRecordId('proof-1')).resolves.toMatchObject({
      verificationRequestId: 'verification-1',
    })
  })

  it('keeps exactly one default trusted schema policy', async () => {
    const store = new VerificationStore(filePath)
    const base = {
      active: true,
      attributes: ['studentNumber'],
      createdAt: '2026-06-23T10:00:00.000Z',
      isDefault: false,
      schemaId: 'schema-1',
      schemaName: 'StudentIdentity',
      schemaVersion: '1.0',
      updatedAt: '2026-06-23T10:00:00.000Z',
    }

    await store.upsertTrustedCredentialDefinition(
      { ...base, credentialDefinitionId: 'cred-def-1' },
      true,
    )
    await store.upsertTrustedCredentialDefinition(
      { ...base, credentialDefinitionId: 'cred-def-2', schemaId: 'schema-2', schemaVersion: '2.0' },
      true,
    )

    const records = await store.listTrustedCredentialDefinitions()
    expect(records.filter((record) => record.isDefault)).toEqual([
      expect.objectContaining({ credentialDefinitionId: 'cred-def-2' }),
    ])
  })

  it('finds sessions using the wallet idempotency key', async () => {
    const store = new VerificationStore(filePath)
    await store.insertSession(session(1))

    await expect(store.findSessionByClientRequest('service-point-1', 'client-1')).resolves.toMatchObject({
      proofRecordId: 'proof-1',
    })
  })

  it('prevents duplicate vendor service-point identifiers', async () => {
    const store = new VerificationStore(filePath)
    await store.insertServicePoint(servicePoint(1))

    await expect(
      store.insertServicePoint({ ...servicePoint(2), externalId: 'counter-1' }),
    ).rejects.toMatchObject({ code: 'SERVICE_POINT_ALREADY_EXISTS' })
  })

  it('updates one session without changing unrelated records', async () => {
    const store = new VerificationStore(filePath)
    await store.insertSession(session(1))
    await store.insertSession(session(2))

    await store.updateSession('verification-1', (record) => ({ ...record, decision: 'Approved' }))

    expect(await store.findSessionById('verification-1')).toMatchObject({ decision: 'Approved' })
    expect(await store.findSessionById('verification-2')).toMatchObject({ decision: 'Pending' })
  })

  it('reports corrupt persistence separately from protocol errors', async () => {
    await writeFile(filePath, '{not-json')
    const store = new VerificationStore(filePath)

    await expect(store.listSessions()).rejects.toMatchObject({ code: 'VERIFICATION_STORE_CORRUPT' })
  })

  it('stores no presentation or revealed student values in its JSON shape', async () => {
    const store = new VerificationStore(filePath)
    await store.insertServicePoint(servicePoint(1))
    await store.insertSession(session(1))

    const raw = await readFile(filePath, 'utf8')
    expect(raw).not.toContain('studentNumber')
    expect(raw).not.toContain('VOSCAL100')
    expect(raw).not.toContain('presentation')
  })
})
