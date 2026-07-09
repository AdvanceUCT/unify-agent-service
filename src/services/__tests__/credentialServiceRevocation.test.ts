import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { AppError } from '../../errors'
import { CredentialService } from '../credentialService'
import { RevocationIndexStore } from '../revocationIndexStore'

function makeAgent(credentialDefinitionId = 'cred-def-1') {
  let exchangeNumber = 0
  return {
    credentials: {
      createOffer: jest.fn().mockImplementation(async () => {
        exchangeNumber += 1
        return {
          credentialRecord: { id: `exchange-${exchangeNumber}` },
          message: { '@id': `offer-${exchangeNumber}` },
        }
      }),
    },
    modules: {
      anoncreds: {
        getRevocationRegistryDefinition: jest.fn().mockResolvedValue({
          revocationRegistryDefinition: {
            credDefId: credentialDefinitionId,
            value: { maxCredNum: 100 },
          },
        }),
      },
    },
    oob: {
      createInvitation: jest.fn().mockImplementation(async () => ({
        id: 'oob-1',
        outOfBandInvitation: { toUrl: () => 'https://issuer.example/oob' },
      })),
    },
  }
}

describe('CredentialService revocation allocation', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'unify-revocation-index-'))
  })

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  it('allocates a unique persistent index for each revocable offer', async () => {
    const agent = makeAgent()
    const service = new CredentialService(
      agent as never,
      new RevocationIndexStore(join(directory, 'indexes.json')),
    )
    const input = {
      attributes: [{ name: 'studentNumber', value: 'STU001' }],
      credentialDefinitionId: 'cred-def-1',
      revocationRegistryDefinitionId: 'rev-reg-1',
    }

    const first = await service.createOfferInvitation(input)
    const second = await service.createOfferInvitation(input)

    expect(first.credentialRevocationId).toBe('1')
    expect(second.credentialRevocationId).toBe('2')
    expect(agent.credentials.createOffer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        credentialFormats: {
          anoncreds: expect.objectContaining({
            revocationRegistryDefinitionId: 'rev-reg-1',
            revocationRegistryIndex: 2,
          }),
        },
      }),
    )
  })

  it('rejects a registry belonging to another credential definition', async () => {
    const service = new CredentialService(
      makeAgent('other-cred-def') as never,
      new RevocationIndexStore(join(directory, 'indexes.json')),
    )

    const error = await service
      .createOfferInvitation({
        attributes: [{ name: 'studentNumber', value: 'STU001' }],
        credentialDefinitionId: 'cred-def-1',
        revocationRegistryDefinitionId: 'rev-reg-1',
      })
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('REVOCATION_REGISTRY_CREDENTIAL_DEFINITION_MISMATCH')
  })
})
