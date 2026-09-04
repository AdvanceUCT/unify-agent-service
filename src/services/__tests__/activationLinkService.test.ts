import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ActivationLinkService } from '../activationLinkService'
import { ActivationStore } from '../activationStore'
import { WalletActivationService } from '../walletActivationService'

function makeAgent() {
  const invitationToUrl = jest.fn(() => 'https://issuer.example.test/oob?oob=encoded-invitation')

  return {
    credentials: {
      createOffer: jest.fn().mockResolvedValue({
        credentialRecord: { id: 'credential-exchange-001' },
        message: { '@id': 'offer-message-001' },
      }),
    },
    oob: {
      createInvitation: jest.fn().mockResolvedValue({
        id: 'oob-001',
        outOfBandInvitation: {
          toUrl: invitationToUrl,
        },
      }),
    },
    invitationToUrl,
  }
}

describe('ActivationLinkService', () => {
  let tempDir: string | undefined

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true })
    }
    tempDir = undefined
    jest.clearAllMocks()
  })

  it('creates tokenized wallet links backed by real credential offers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'unify-activation-links-'))
    tempDir = dir
    const storeFile = join(dir, 'activations.json')
    const store = new ActivationStore(storeFile)
    const agent = makeAgent()
    const service = new ActivationLinkService(agent as never, store)

    const result = await service.createBatchActivationLinks({
      credentialDefinitionId: 'cred-def-id',
      students: [
        {
          email: 'caleb.voskuil@gmail.com',
          externalId: 'student-demo-100',
          attributes: [
            { name: 'studentNumber', value: 'VOSCAL100' },
            { name: 'firstName', value: 'Caleb' },
            { name: 'lastName', value: 'Voskuil' },
          ],
        },
      ],
    })

    expect(result.failures).toEqual([])
    expect(result.offers).toHaveLength(1)
    expect(result.offers[0]).toMatchObject({
      credentialExchangeId: 'credential-exchange-001',
      email: 'caleb.voskuil@gmail.com',
      externalId: 'student-demo-100',
      outOfBandId: 'oob-001',
    })
    expect(result.offers[0].activationUrl).toMatch(/^unifywallet:\/\/activate\?token=/)
    expect(agent.credentials.createOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialFormats: {
          anoncreds: expect.objectContaining({
            credentialDefinitionId: 'cred-def-id',
          }),
        },
      }),
    )
    expect(agent.oob.createInvitation).toHaveBeenCalledWith({
      messages: [{ '@id': 'offer-message-001' }],
    })
    expect(agent.invitationToUrl).toHaveBeenCalledWith({ domain: 'http://localhost:3001' })

    const token = new URL(result.offers[0].activationUrl).searchParams.get('token')
    expect(token).toBeTruthy()
    const rawStore = await readFile(storeFile, 'utf8')
    expect(rawStore).not.toContain(token)

    const walletActivation = new WalletActivationService(agent as never, store)
    await expect(walletActivation.resolve({ token: token ?? '' })).resolves.toMatchObject({
      credentialExchangeId: 'credential-exchange-001',
      invitationUrl: 'https://issuer.example.test/oob?oob=encoded-invitation',
    })
  })

  it('replays a keyed activation request without creating another offer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'unify-activation-links-'))
    tempDir = dir
    const store = new ActivationStore(join(dir, 'activations.json'))
    const agent = makeAgent()
    const service = new ActivationLinkService(agent as never, store)
    const request = {
      credentialDefinitionId: 'cred-def-id',
      students: [{
        attributes: [{ name: 'studentNumber', value: 'VOSCAL100' }],
        email: 'caleb.voskuil@gmail.com',
        externalId: 'student-demo-100',
        idempotencyKey: 'renewal-job-001',
      }],
    }

    const [first, replay] = await Promise.all([
      service.createBatchActivationLinks(request),
      service.createBatchActivationLinks(request),
    ])

    expect(replay.offers[0]).toMatchObject({
      activationId: first.offers[0].activationId,
      activationUrl: first.offers[0].activationUrl,
      credentialExchangeId: first.offers[0].credentialExchangeId,
    })
    expect(agent.credentials.createOffer).toHaveBeenCalledTimes(1)
    expect(agent.oob.createInvitation).toHaveBeenCalledTimes(1)
  })
})
