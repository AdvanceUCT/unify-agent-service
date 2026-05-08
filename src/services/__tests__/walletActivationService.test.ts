import { config } from '../../config'
import { AppError } from '../../errors'
import { WalletActivationService } from '../walletActivationService'

function makeAgent() {
  return {
    credentials: {
      createOffer: jest.fn().mockResolvedValue({
        credentialRecord: { id: 'credential-exchange-001' },
        message: { '@id': 'offer-message-001' },
      }),
    },
    oob: {
      createInvitation: jest.fn().mockResolvedValue({
        outOfBandInvitation: {
          toUrl: jest.fn(() => 'https://issuer.example.test/oob?oob=encoded-invitation'),
        },
      }),
    },
  }
}

function setDemoCredentialDefinitionId(value: string | undefined) {
  ;(config.demoIssuance as { credentialDefinitionId?: string }).credentialDefinitionId = value
}

describe('WalletActivationService', () => {
  const originalCredentialDefinitionId = config.demoIssuance.credentialDefinitionId

  afterEach(() => {
    setDemoCredentialDefinitionId(originalCredentialDefinitionId)
    jest.clearAllMocks()
  })

  it('creates a real credential offer invitation for an activation token', async () => {
    setDemoCredentialDefinitionId('cred-def-id')
    const agent = makeAgent()
    const service = new WalletActivationService(agent as never)

    const resolved = await service.resolve({ token: 'demo-token' })

    expect(resolved).toMatchObject({
      activationSource: 'token',
      credentialExchangeId: 'credential-exchange-001',
      invitationUrl: 'https://issuer.example.test/oob?oob=encoded-invitation',
      issuerLabel: 'UNIFY Issuer Service',
      ledgerName: 'BCovrin Test',
      studentId: 'student-demo-001',
      walletId: 'wallet-demo-001',
    })
    expect(agent.credentials.createOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialFormats: {
          anoncreds: expect.objectContaining({
            credentialDefinitionId: 'cred-def-id',
          }),
        },
      }),
    )

    await expect(
      service.complete({
        activationId: resolved.activationId,
        credentialRecordId: 'holder-credential-record-001',
        holderConnectionId: 'holder-connection-001',
      }),
    ).resolves.toMatchObject({
      activationId: resolved.activationId,
      credentialExchangeId: 'credential-exchange-001',
      credentialRecordId: 'holder-credential-record-001',
      holderConnectionId: 'holder-connection-001',
    })
  })

  it('requires a configured credential definition before resolving activations', async () => {
    setDemoCredentialDefinitionId(undefined)
    const service = new WalletActivationService(makeAgent() as never)

    const error = await service.resolve({ token: 'demo-token' }).catch((err) => err)

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(503)
  })
})
