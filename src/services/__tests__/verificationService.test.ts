import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { VerificationRateLimiter } from '../verificationRateLimiter'
import { VerificationService } from '../verificationService'
import { VerificationStore } from '../verificationStore'

const revealedAttributes = {
  studentNumber: { raw: 'VOSCAL100', encoded: '1' },
  enrolmentStatus: { raw: 'Registered', encoded: '2' },
  faculty: { raw: 'Commerce', encoded: '3' },
  programme: { raw: 'Business Science', encoded: '4' },
}

function makeAgent() {
  let proofRecord = {
    id: 'proof-001',
    state: 'request-sent',
    isVerified: undefined as boolean | undefined,
    errorMessage: undefined as string | undefined,
    updatedAt: new Date('2026-06-23T10:00:00.000Z'),
  }

  const invitationToUrl = jest.fn(() => 'https://agent.example.test?oob=proof-invitation')
  const outOfBandRecord = {
    id: 'oob-001',
    outOfBandInvitation: { toUrl: invitationToUrl },
  }

  const agent = {
    proofs: {
      createRequest: jest.fn().mockImplementation(async () => ({
        message: { '@id': 'proof-request-message' },
        proofRecord,
      })),
      findById: jest.fn().mockImplementation(async () => proofRecord),
      getFormatData: jest.fn().mockResolvedValue({
        presentation: {
          anoncreds: {
            requested_proof: {
              revealed_attr_groups: {
                student_details: { values: revealedAttributes },
              },
            },
            identifiers: [{ cred_def_id: 'cred-def-001' }],
          },
        },
      }),
      deleteById: jest.fn().mockResolvedValue(undefined),
    },
    oob: {
      createInvitation: jest.fn().mockResolvedValue(outOfBandRecord),
      getById: jest.fn().mockResolvedValue(outOfBandRecord),
      findById: jest.fn().mockResolvedValue(outOfBandRecord),
      deleteById: jest.fn().mockResolvedValue(undefined),
    },
  }

  return {
    agent,
    setProofRecord(next: Partial<typeof proofRecord>) {
      proofRecord = { ...proofRecord, ...next }
    },
  }
}

describe('VerificationService', () => {
  let directory: string
  let store: VerificationStore
  let now: Date

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'unify-verification-service-'))
    store = new VerificationStore(join(directory, 'verification.json'))
    now = new Date('2026-06-23T10:00:00.000Z')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  function serviceFor(agent: ReturnType<typeof makeAgent>['agent'], overrides = {}) {
    return new VerificationService(agent as never, store, {
      now: () => now,
      trustedCredentialDefinitionIds: ['cred-def-001'],
      rateLimiter: new VerificationRateLimiter({ perIp: 100, perServicePoint: 100 }),
      ...overrides,
    })
  }

  async function registeredPoint(service: VerificationService) {
    return service.createServicePoint({
      vendorId: 'vendor-001',
      vendorName: 'Library Cafe',
      externalId: 'main-counter',
      name: 'Main Counter',
    })
  }

  it('creates a restricted AnonCreds proof request and OOB invitation', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
    const point = await registeredPoint(service)

    const result = await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    })

    expect(result).toMatchObject({
      invitationUrl: 'https://agent.example.test?oob=proof-invitation',
      vendorName: 'Library Cafe',
      servicePointName: 'Main Counter',
    })
    expect(agent.proofs.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: 'v2',
        proofFormats: {
          anoncreds: expect.objectContaining({
            requested_attributes: {
              student_details: {
                names: ['studentNumber', 'enrolmentStatus', 'faculty', 'programme'],
                restrictions: [{ cred_def_id: 'cred-def-001' }],
              },
            },
          }),
        },
      }),
    )
    expect(agent.oob.createInvitation).toHaveBeenCalledWith({
      messages: [{ '@id': 'proof-request-message' }],
    })
  })

  it('keeps the static service-point verification URL stable', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
    const created = await registeredPoint(service)
    const fetched = await service.getServicePoint(created.id)

    expect(created.verificationUrl).toContain(`/verify/${created.publicId}`)
    expect(fetched.verificationUrl).toBe(created.verificationUrl)
  })

  it('blocks new sessions when an administrator disables the service point', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
    const point = await registeredPoint(service)
    await service.updateServicePoint(point.id, { active: false })

    await expect(
      service.startSession({
        publicServicePointId: point.publicId,
        clientRequestId: 'client-001',
        requestIp: '192.0.2.1',
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_POINT_DISABLED' })
    expect(agent.proofs.createRequest).not.toHaveBeenCalled()
  })

  it('adds a current non-revocation interval when enabled', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent, { requireNonRevoked: true })
    const point = await registeredPoint(service)

    await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    })

    expect(agent.proofs.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        proofFormats: {
          anoncreds: expect.objectContaining({ non_revoked: { to: 1782208800 } }),
        },
      }),
    )
  })

  it('returns the same session for duplicate mobile requests', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
    const point = await registeredPoint(service)
    const input = {
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    }

    const first = await service.startSession(input)
    const second = await service.startSession(input)

    expect(second.verificationRequestId).toBe(first.verificationRequestId)
    expect(agent.proofs.createRequest).toHaveBeenCalledTimes(1)
    expect(agent.oob.getById).toHaveBeenCalledWith('oob-001')
  })

  it('rejects session creation when the trusted allowlist is empty', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent, { trustedCredentialDefinitionIds: [] })
    const point = await registeredPoint(service)

    await expect(
      service.startSession({
        publicServicePointId: point.publicId,
        clientRequestId: 'client-001',
        requestIp: '192.0.2.1',
      }),
    ).rejects.toMatchObject({ code: 'VERIFIER_NOT_CONFIGURED' })
    expect(agent.proofs.createRequest).not.toHaveBeenCalled()
  })

  it('reports a busy service point before creating another Credo request', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent, { maxPendingPerServicePoint: 1 })
    const point = await registeredPoint(service)
    await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    })

    await expect(
      service.startSession({
        publicServicePointId: point.publicId,
        clientRequestId: 'client-002',
        requestIp: '192.0.2.2',
      }),
    ).rejects.toMatchObject({ code: 'VERIFICATION_SERVICE_POINT_BUSY' })
    expect(agent.proofs.createRequest).toHaveBeenCalledTimes(1)
  })

  it('reports proof creation failures as Credo protocol faults', async () => {
    const { agent } = makeAgent()
    agent.proofs.createRequest.mockRejectedValueOnce(new Error('proof module unavailable'))
    const service = serviceFor(agent)
    const point = await registeredPoint(service)

    await expect(
      service.startSession({
        publicServicePointId: point.publicId,
        clientRequestId: 'client-001',
        requestIp: '192.0.2.1',
      }),
    ).rejects.toMatchObject({ code: 'CREDO_PROTOCOL_ERROR' })
  })

  it('returns Approved with the four verified attributes', async () => {
    const agentState = makeAgent()
    const service = serviceFor(agentState.agent)
    const point = await registeredPoint(service)
    const started = await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    })
    agentState.setProofRecord({ state: 'done', isVerified: true })

    const status = await service.getStatus(started.verificationRequestId)

    expect(status).toMatchObject({
      status: 'Approved',
      isVerified: true,
      attributes: {
        studentNumber: 'VOSCAL100',
        enrolmentStatus: 'Registered',
        faculty: 'Commerce',
        programme: 'Business Science',
      },
    })
  })

  it('reports a missing Credo proof record as a protocol failure', async () => {
    const agentState = makeAgent()
    const service = serviceFor(agentState.agent)
    const point = await registeredPoint(service)
    const started = await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    })
    agentState.agent.proofs.findById.mockResolvedValueOnce(null)

    await expect(service.getStatus(started.verificationRequestId)).resolves.toMatchObject({
      status: 'Failed',
      failureCode: 'CREDO_PROTOCOL_ERROR',
    })
  })

  it('removes proof material after the result visibility window', async () => {
    const agentState = makeAgent()
    const service = serviceFor(agentState.agent)
    const point = await registeredPoint(service)
    const started = await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    })
    agentState.setProofRecord({ state: 'done', isVerified: true })
    now = new Date('2026-06-23T10:01:00.000Z')
    await service.getStatus(started.verificationRequestId)

    now = new Date('2026-06-23T10:17:00.000Z')
    await service.runCleanup()

    expect(agentState.agent.proofs.deleteById).toHaveBeenCalledWith('proof-001')
    expect(agentState.agent.oob.deleteById).toHaveBeenCalledWith('oob-001')
    await expect(store.findSessionById(started.verificationRequestId)).resolves.toMatchObject({
      decision: 'Approved',
      proofRecordDeletedAt: '2026-06-23T10:17:00.000Z',
    })

    await expect(service.getStatus(started.verificationRequestId)).resolves.toMatchObject({
      status: 'Approved',
      isVerified: true,
    })
  })
})
