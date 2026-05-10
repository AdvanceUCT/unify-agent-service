import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ActivationLinkService } from '../activationLinkService'
import { ActivationStore } from '../activationStore'
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
})
