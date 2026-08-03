import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { VerificationRateLimiter } from '../verificationRateLimiter'
import { VerificationService } from '../verificationService'
import { VerificationStore } from '../verificationStore'

const revealedAttributes = {
  studentNumber: { raw: 'VOSCAL100', encoded: '1' },
  faculty: { raw: 'Commerce', encoded: '2' },
  year: { raw: '2026', encoded: '3' },
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
    modules: {
      anoncreds: {
        getCredentialDefinition: jest.fn().mockResolvedValue({
          credentialDefinition: {
            schemaId: 'schema-001',
            value: { revocation: { g: 'revocation-public-key' } },
          },
        }),
        getSchema: jest.fn().mockResolvedValue({
          schema: {
            attrNames: ['studentNumber', 'faculty', 'year'],
            name: 'StudentIdentity',
            version: '1.0',
          },
        }),
      },
    },
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
      resultTokenSecret: 'test-result-token-secret',
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
                names: ['studentNumber', 'faculty', 'year'],
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

  it('always adds a current non-revocation interval', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
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

  it('creates an idempotent checkout session without creating a proof before claim', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
    const point = await registeredPoint(service)

    const first = await service.createCheckoutSession({
      vendorId: 'vendor-001',
      servicePointId: point.id,
      checkoutId: 'cart-001',
    })
    const duplicate = await service.createCheckoutSession({
      vendorId: 'vendor-001',
      servicePointId: point.id,
      checkoutId: 'cart-001',
    })

    expect(duplicate).toEqual(first)
    expect(first.verificationUrl).toContain(`/verify/checkout/${first.verificationRequestId}`)
    expect(new URL(first.verificationUrl).searchParams.get('token')).toBeTruthy()
    expect(agent.proofs.createRequest).not.toHaveBeenCalled()
  })

  it('atomically claims a checkout session and rejects replay', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
    const point = await registeredPoint(service)
    const checkout = await service.createCheckoutSession({
      vendorId: 'vendor-001',
      servicePointId: point.id,
      checkoutId: 'cart-001',
    })
    const claimToken = new URL(checkout.verificationUrl).searchParams.get('token') as string

    const claimed = await service.claimCheckoutSession({
      verificationRequestId: checkout.verificationRequestId,
      claimToken,
    })

    expect(claimed.invitationUrl).toBe('https://agent.example.test?oob=proof-invitation')
    expect(agent.proofs.createRequest).toHaveBeenCalledTimes(1)
    await expect(
      service.claimCheckoutSession({
        verificationRequestId: checkout.verificationRequestId,
        claimToken,
      }),
    ).rejects.toMatchObject({ code: 'VERIFICATION_SESSION_REUSED' })
    expect(agent.proofs.createRequest).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid checkout claim capability without creating a proof', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
    const point = await registeredPoint(service)
    const checkout = await service.createCheckoutSession({
      vendorId: 'vendor-001',
      servicePointId: point.id,
      checkoutId: 'cart-001',
    })

    await expect(
      service.claimCheckoutSession({
        verificationRequestId: checkout.verificationRequestId,
        claimToken: 'wrong-capability',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SESSION_CAPABILITY' })
    expect(agent.proofs.createRequest).not.toHaveBeenCalled()
  })

  it('rejects an unclaimed checkout session after its service point is disabled', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
    const point = await registeredPoint(service)
    const checkout = await service.createCheckoutSession({
      vendorId: 'vendor-001',
      servicePointId: point.id,
      checkoutId: 'cart-001',
    })
    const claimToken = new URL(checkout.verificationUrl).searchParams.get('token') as string
    await service.updateServicePoint(point.id, { active: false })

    await expect(
      service.claimCheckoutSession({
        verificationRequestId: checkout.verificationRequestId,
        claimToken,
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_POINT_DISABLED' })
    expect(agent.proofs.createRequest).not.toHaveBeenCalled()
  })

  it('requests every attribute from the selected schema version', async () => {
    const { agent } = makeAgent()
    agent.modules.anoncreds.getCredentialDefinition.mockResolvedValueOnce({
      credentialDefinition: {
        schemaId: 'schema-002',
        value: { revocation: { g: 'revocation-public-key' } },
      },
    })
    agent.modules.anoncreds.getSchema.mockResolvedValueOnce({
      schema: {
        attrNames: ['studentNumber', 'faculty', 'year', 'programme'],
        name: 'StudentIdentity',
        version: '2.0',
      },
    })
    const service = serviceFor(agent)
    await service.registerTrustedCredentialDefinition({
      credentialDefinitionId: 'cred-def-002',
      makeDefault: true,
    })
    const point = await registeredPoint(service)

    await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-v2',
      requestIp: '192.0.2.1',
    })

    expect(agent.proofs.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        proofFormats: {
          anoncreds: expect.objectContaining({
            requested_attributes: {
              student_details: {
                names: ['studentNumber', 'faculty', 'year', 'programme'],
                restrictions: [{ cred_def_id: 'cred-def-002' }],
              },
            },
          }),
        },
      }),
    )
  })

  it('keeps an existing service point bound to its original schema version', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
    const oldPoint = await registeredPoint(service)

    agent.modules.anoncreds.getCredentialDefinition.mockResolvedValueOnce({
      credentialDefinition: {
        schemaId: 'schema-002',
        value: { revocation: { g: 'revocation-public-key' } },
      },
    })
    agent.modules.anoncreds.getSchema.mockResolvedValueOnce({
      schema: {
        attrNames: ['studentNumber', 'faculty', 'year', 'programme'],
        name: 'StudentIdentity',
        version: '2.0',
      },
    })
    await service.registerTrustedCredentialDefinition({
      credentialDefinitionId: 'cred-def-002',
      makeDefault: true,
    })

    await service.startSession({
      publicServicePointId: oldPoint.publicId,
      clientRequestId: 'client-old-schema',
      requestIp: '192.0.2.1',
    })

    expect(agent.proofs.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        proofFormats: {
          anoncreds: expect.objectContaining({
            requested_attributes: {
              student_details: {
                names: ['studentNumber', 'faculty', 'year'],
                restrictions: [{ cred_def_id: 'cred-def-001' }],
              },
            },
          }),
        },
      }),
    )
  })

  it('rejects a trusted credential definition without revocation support', async () => {
    const { agent } = makeAgent()
    agent.modules.anoncreds.getCredentialDefinition.mockResolvedValueOnce({
      credentialDefinition: { schemaId: 'schema-001', value: {} },
    })
    const service = serviceFor(agent)

    await expect(
      registeredPoint(service),
    ).rejects.toMatchObject({ code: 'TRUSTED_CREDENTIAL_DEFINITION_NOT_REVOCABLE' })
    expect(agent.proofs.createRequest).not.toHaveBeenCalled()
  })

  it('reports an unavailable trusted credential definition as configuration failure', async () => {
    const { agent } = makeAgent()
    agent.modules.anoncreds.getCredentialDefinition.mockRejectedValueOnce(new Error('ledger unavailable'))
    const service = serviceFor(agent)

    await expect(
      registeredPoint(service),
    ).rejects.toMatchObject({ code: 'TRUSTED_CREDENTIAL_DEFINITION_UNAVAILABLE' })
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
    expect(second.resultToken).toBe(first.resultToken)
    expect(agent.proofs.createRequest).toHaveBeenCalledTimes(1)
    expect(agent.oob.getById).toHaveBeenCalledWith('oob-001')
  })

  it('returns only wallet-safe result fields for a valid capability', async () => {
    const agentState = makeAgent()
    const service = serviceFor(agentState.agent)
    const point = await registeredPoint(service)
    const started = await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    })
    agentState.setProofRecord({ state: 'done', isVerified: true })

    const result = await service.getWalletResult(started.verificationRequestId, started.resultToken)

    expect(result).toEqual({
      status: 'Approved',
      expiresAt: started.expiresAt,
      completedAt: '2026-06-23T10:00:00.000Z',
    })
    expect(result).not.toHaveProperty('attributes')
    expect(result).not.toHaveProperty('vendorId')
    expect(result).not.toHaveProperty('proofRecordId')
  })

  it.each([undefined, 'wrong-token'])('rejects a missing or invalid result capability', async (token) => {
    const { agent } = makeAgent()
    const service = serviceFor(agent)
    const point = await registeredPoint(service)
    const started = await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    })

    await expect(service.getWalletResult(started.verificationRequestId, token)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_VERIFICATION_RESULT_TOKEN',
    })
  })

  it('expires the result capability after the visibility window', async () => {
    const agentState = makeAgent()
    const service = serviceFor(agentState.agent)
    const point = await registeredPoint(service)
    const started = await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    })
    agentState.setProofRecord({ state: 'done', isVerified: true })
    await service.getWalletResult(started.verificationRequestId, started.resultToken)

    now = new Date('2026-06-23T10:16:00.000Z')

    await expect(
      service.getWalletResult(started.verificationRequestId, started.resultToken),
    ).rejects.toMatchObject({ status: 410, code: 'VERIFICATION_RESULT_EXPIRED' })
  })

  it('does not reopen visibility when an expired session is first polled late', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent, { sessionTtlMinutes: 5, resultVisibilityMinutes: 15 })
    const point = await registeredPoint(service)
    const started = await service.startSession({
      publicServicePointId: point.publicId,
      clientRequestId: 'client-001',
      requestIp: '192.0.2.1',
    })

    now = new Date('2026-06-23T10:21:00.000Z')

    await expect(
      service.getWalletResult(started.verificationRequestId, started.resultToken),
    ).rejects.toMatchObject({ status: 410, code: 'VERIFICATION_RESULT_EXPIRED' })
    await expect(store.findSessionById(started.verificationRequestId)).resolves.toMatchObject({
      decision: 'Expired',
      completedAt: '2026-06-23T10:05:00.000Z',
      detailsVisibleUntil: '2026-06-23T10:20:00.000Z',
    })
  })

  it('rejects service-point creation when no trusted schema is configured', async () => {
    const { agent } = makeAgent()
    const service = serviceFor(agent, { trustedCredentialDefinitionIds: [] })

    await expect(registeredPoint(service)).rejects.toMatchObject({ code: 'VERIFIER_NOT_CONFIGURED' })
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

  it('returns Approved with the three verified attributes', async () => {
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
        faculty: 'Commerce',
        year: '2026',
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
