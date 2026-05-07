import { AppError } from '../../errors'
import { IssuanceSetupService } from '../issuanceSetupService'

function finishedSchema(schemaId = 'schema-id') {
  return {
    schemaState: {
      state: 'finished',
      schemaId,
    },
  }
}

function finishedCredentialDefinition(credentialDefinitionId = 'cred-def-id') {
  return {
    credentialDefinitionState: {
      state: 'finished',
      credentialDefinitionId,
    },
  }
}

function finishedRevocationRegistry(revocationRegistryDefinitionId = 'rev-reg-id') {
  return {
    revocationRegistryDefinitionState: {
      state: 'finished',
      revocationRegistryDefinitionId,
    },
  }
}

function finishedRevocationStatusList(timestamp = 1234567890) {
  return {
    revocationStatusListState: {
      state: 'finished',
      revocationStatusList: { timestamp },
    },
  }
}

function makeAgent(overrides: {
  registerRevocationRegistryDefinition?: jest.Mock
} = {}) {
  return {
    modules: {
      anoncreds: {
        registerSchema: jest.fn().mockResolvedValue(finishedSchema()),
        registerCredentialDefinition: jest.fn().mockResolvedValue(finishedCredentialDefinition()),
        registerRevocationRegistryDefinition:
          overrides.registerRevocationRegistryDefinition ??
          jest.fn().mockResolvedValue(finishedRevocationRegistry()),
        registerRevocationStatusList: jest.fn().mockResolvedValue(finishedRevocationStatusList()),
      },
    },
  }
}

const baseInput = {
  issuerDid: 'did:indy:bcovrin:test:issuer',
  schema: {
    name: 'StudentCredential',
    version: '1.0',
    attributes: ['studentNumber', 'fullName'],
  },
  credentialDefinition: {
    tag: 'default',
  },
}

describe('IssuanceSetupService', () => {
  it('creates schema and credential definition without revocation by default', async () => {
    const agent = makeAgent()
    const service = new IssuanceSetupService(agent as never)

    await expect(service.setup(baseInput)).resolves.toEqual({
      schemaId: 'schema-id',
      credentialDefinitionId: 'cred-def-id',
    })

    expect(agent.modules.anoncreds.registerCredentialDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ supportRevocation: false }),
      }),
    )
    expect(agent.modules.anoncreds.registerRevocationRegistryDefinition).not.toHaveBeenCalled()
  })

  it('creates revocation registry and status list when revocation is provided', async () => {
    const agent = makeAgent()
    const service = new IssuanceSetupService(agent as never)

    await expect(
      service.setup({
        ...baseInput,
        revocation: {
          tag: 'revocation',
          maximumCredentialNumber: 100,
        },
      }),
    ).resolves.toEqual({
      schemaId: 'schema-id',
      credentialDefinitionId: 'cred-def-id',
      revocationRegistryDefinitionId: 'rev-reg-id',
      revocationStatusListTimestamp: 1234567890,
    })

    expect(agent.modules.anoncreds.registerCredentialDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ supportRevocation: true }),
      }),
    )
    expect(agent.modules.anoncreds.registerRevocationStatusList).toHaveBeenCalled()
  })

  it('returns partial setup ids when revocation fails after credential definition creation', async () => {
    const agent = makeAgent({
      registerRevocationRegistryDefinition: jest.fn().mockResolvedValue({
        revocationRegistryDefinitionState: {
          state: 'failed',
          reason: 'tails upload failed',
        },
      }),
    })
    const service = new IssuanceSetupService(agent as never)

    const err = await service
      .setup({
        ...baseInput,
        credentialDefinition: {
          tag: 'default',
          supportRevocation: true,
        },
        revocation: {
          tag: 'revocation',
          maximumCredentialNumber: 100,
        },
      })
      .catch((error) => error)

    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).status).toBe(422)
    expect((err as AppError).details).toEqual({
      schemaId: 'schema-id',
      credentialDefinitionId: 'cred-def-id',
    })
  })

  it('rejects supportRevocation=true without revocation settings', async () => {
    const service = new IssuanceSetupService(makeAgent() as never)

    const err = await service
      .setup({
        ...baseInput,
        credentialDefinition: {
          tag: 'default',
          supportRevocation: true,
        },
      })
      .catch((error) => error)

    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).status).toBe(400)
  })
})
