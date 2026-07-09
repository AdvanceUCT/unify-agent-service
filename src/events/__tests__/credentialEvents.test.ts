import { AnonCredsCredentialRepository } from '@credo-ts/anoncreds'

import { registerCredentialEventHandlers } from '../credentialEvents'

function setup(anonCredsRecord?: Record<string, unknown>) {
  let handler: ((event: unknown) => Promise<void>) | undefined
  const repository = {
    findById: jest.fn().mockResolvedValue(anonCredsRecord),
  }
  const agent = {
    context: { contextCorrelationId: 'test-context' },
    dependencyManager: {
      resolve: jest.fn((token) => {
        if (token === AnonCredsCredentialRepository) return repository
        throw new Error('unexpected dependency')
      }),
    },
    events: {
      on: jest.fn((_type, registeredHandler) => {
        handler = registeredHandler
      }),
    },
  }
  const webhookDispatcher = jest.fn().mockResolvedValue(undefined)

  registerCredentialEventHandlers(agent as never, webhookDispatcher)

  return {
    repository,
    webhookDispatcher,
    emit: async (credentialRecord: Record<string, unknown>, previousState: string | null = null) => {
      await handler?.({
        payload: {
          credentialRecord: { metadata: { get: () => undefined }, ...credentialRecord },
          previousState,
        },
      })
    },
  }
}

describe('registerCredentialEventHandlers', () => {
  it('reads issuer-side revocation metadata directly from the credential exchange', async () => {
    const on = jest.fn()
    const webhook = jest.fn().mockResolvedValue(undefined)
    const agent = { events: { on } } as never

    registerCredentialEventHandlers(agent, webhook)
    const handler = on.mock.calls[0][1]
    await handler({
      payload: {
        credentialRecord: {
          connectionId: 'connection-001',
          credentials: [],
          id: 'credential-exchange-001',
          metadata: {
            get: () => ({ credentialRevocationId: '8', revocationRegistryId: 'rev-reg-issuer' }),
          },
          state: 'done',
        },
        previousState: 'credential-issued',
      },
    })

    expect(webhook).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialRevocationId: '8',
        revocationRegistryDefinitionId: 'rev-reg-issuer',
      }),
    )
  })

  it('adds revocation metadata to credential webhooks when Credo has stored it', async () => {
    const context = setup({
      credential: { rev_reg_id: 'rev-reg-001' },
      credentialRevocationId: '42',
    })

    await context.emit(
      {
        connectionId: 'connection-001',
        credentials: [
          {
            credentialRecordId: 'anoncreds-credential-001',
            credentialRecordType: 'AnonCredsCredentialRecord',
          },
        ],
        id: 'credential-exchange-001',
        state: 'done',
      },
      'credential-issued',
    )

    expect(context.repository.findById).toHaveBeenCalledWith(
      expect.anything(),
      'anoncreds-credential-001',
    )
    expect(context.webhookDispatcher).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'connection-001',
        credentialExchangeId: 'credential-exchange-001',
        credentialRevocationId: '42',
        previousState: 'credential-issued',
        revocationRegistryDefinitionId: 'rev-reg-001',
        state: 'done',
        type: 'credential.stateChanged',
      }),
    )
  })

  it('still dispatches credential webhooks when no AnonCreds binding exists', async () => {
    const context = setup()

    await context.emit({
      connectionId: 'connection-001',
      credentials: [],
      id: 'credential-exchange-001',
      state: 'offer-sent',
    })

    expect(context.repository.findById).not.toHaveBeenCalled()
    expect(context.webhookDispatcher).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialExchangeId: 'credential-exchange-001',
        state: 'offer-sent',
        type: 'credential.stateChanged',
      }),
    )
  })
})
