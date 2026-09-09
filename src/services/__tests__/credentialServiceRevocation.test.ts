import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { AppError } from '../../errors'
import { CredentialService } from '../credentialService'
import { RevocationIndexStore } from '../revocationIndexStore'

function withRevocationRegistryDefinitionId<T extends object>(
  input: T,
  revocationRegistryDefinitionId?: string,
): T & { revocationRegistryDefinitionId?: string } {
  if (revocationRegistryDefinitionId) {
    ;(input as Record<string, unknown>).revocationRegistryDefinitionId = revocationRegistryDefinitionId
  }

  return input as T & { revocationRegistryDefinitionId?: string }
}

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

    const input: Parameters<CredentialService['createOfferInvitation']>[0] = {
      attributes: [{ name: 'studentNumber', value: 'STU001' }],
      credentialDefinitionId: 'cred-def-1',
    }

    const error = await service
      .createOfferInvitation(withRevocationRegistryDefinitionId(input, 'rev-reg-1'))
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('REVOCATION_REGISTRY_CREDENTIAL_DEFINITION_MISMATCH')
  })

  it('resolves one registry, reserves one range, and bounds concurrent batch offers', async () => {
    let activeOffers = 0
    let maximumActiveOffers = 0
    const agent = makeAgent()
    agent.credentials.createOffer.mockImplementation(async (input: {
      credentialFormats: { anoncreds: { revocationRegistryIndex: number } }
    }) => {
      activeOffers += 1
      maximumActiveOffers = Math.max(maximumActiveOffers, activeOffers)
      await new Promise<void>((resolve) => setImmediate(resolve))
      activeOffers -= 1
      const index = input.credentialFormats.anoncreds.revocationRegistryIndex
      return {
        credentialRecord: { id: `exchange-${index}` },
        message: { '@id': `offer-${index}` },
      }
    })
    const service = new CredentialService(
      agent as never,
      new RevocationIndexStore(join(directory, 'indexes.json')),
    )

    const result = await service.createBatchOfferInvitations({
      credentialDefinitionId: 'cred-def-1',
      revocationRegistryDefinitionId: 'rev-reg-1',
      students: Array.from({ length: 10 }, (_, index) => ({
        attributes: [{ name: 'studentNumber', value: `STU${index + 1}` }],
        externalId: `student-${index + 1}`,
      })),
    })

    expect(agent.modules.anoncreds.getRevocationRegistryDefinition).toHaveBeenCalledTimes(1)
    expect(maximumActiveOffers).toBe(4)
    expect(result.failures).toEqual([])
    expect(result.offers.map((offer) => offer.externalId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `student-${index + 1}`),
    )
    expect(result.offers.map((offer) => offer.credentialRevocationId)).toEqual(
      Array.from({ length: 10 }, (_, index) => String(index + 1)),
    )
  })

  it('rejects an undersized registry before creating any batch offers', async () => {
    const agent = makeAgent()
    agent.modules.anoncreds.getRevocationRegistryDefinition.mockResolvedValue({
      revocationRegistryDefinition: {
        credDefId: 'cred-def-1',
        value: { maxCredNum: 3 },
      },
    })
    const service = new CredentialService(
      agent as never,
      new RevocationIndexStore(join(directory, 'indexes.json')),
    )

    const error = await service.createBatchOfferInvitations({
      credentialDefinitionId: 'cred-def-1',
      revocationRegistryDefinitionId: 'rev-reg-1',
      students: Array.from({ length: 3 }, (_, index) => ({
        attributes: [{ name: 'studentNumber', value: `STU${index + 1}` }],
      })),
    }).catch((caught) => caught)

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('REVOCATION_REGISTRY_FULL')
    expect(agent.credentials.createOffer).not.toHaveBeenCalled()
  })

  it('does not reuse an index assigned to a failed batch offer', async () => {
    const agent = makeAgent()
    agent.credentials.createOffer.mockImplementation(async (input: {
      credentialFormats: { anoncreds: { revocationRegistryIndex: number } }
    }) => {
      const index = input.credentialFormats.anoncreds.revocationRegistryIndex
      if (index === 2) throw new Error('offer failed')
      return {
        credentialRecord: { id: `exchange-${index}` },
        message: { '@id': `offer-${index}` },
      }
    })
    const service = new CredentialService(
      agent as never,
      new RevocationIndexStore(join(directory, 'indexes.json')),
    )
    const batchInput = {
      credentialDefinitionId: 'cred-def-1',
      revocationRegistryDefinitionId: 'rev-reg-1',
      students: Array.from({ length: 3 }, (_, index) => ({
        attributes: [{ name: 'studentNumber', value: `STU${index + 1}` }],
        externalId: `student-${index + 1}`,
      })),
    }

    const batch = await service.createBatchOfferInvitations(batchInput)
    const next = await service.createOfferInvitation({
      attributes: [{ name: 'studentNumber', value: 'STU004' }],
      credentialDefinitionId: 'cred-def-1',
      revocationRegistryDefinitionId: 'rev-reg-1',
    })

    expect(batch.failures).toEqual([
      expect.objectContaining({ externalId: 'student-2', message: 'offer failed' }),
    ])
    expect(batch.offers.map((offer) => offer.credentialRevocationId)).toEqual(['1', '3'])
    expect(next.credentialRevocationId).toBe('4')
  })
})
