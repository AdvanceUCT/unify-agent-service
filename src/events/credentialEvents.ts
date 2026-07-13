import {
  CredentialEventTypes,
  type CredentialStateChangedEvent,
} from '@credo-ts/core'

import type { UniversityAgent } from '../agent'
import { findCredentialRevocationMetadata } from '../services/credentialRevocationMetadata'

import { dispatchWebhook } from './webhookDispatcher'

type CredentialWebhookDispatcher = typeof dispatchWebhook

export function registerCredentialEventHandlers(
  agent: UniversityAgent,
  webhookDispatcher: CredentialWebhookDispatcher = dispatchWebhook,
): void {
  agent.events.on<CredentialStateChangedEvent>(
    CredentialEventTypes.CredentialStateChanged,
    async ({ payload }) => {
      const { credentialRecord, previousState } = payload
      let revocationMetadata = {}
      try {
        revocationMetadata = (await findCredentialRevocationMetadata(agent, credentialRecord)) ?? {}
      } catch (error) {
        console.warn(
          `[events] credential ${credentialRecord.id}: could not resolve revocation metadata: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }

      console.log(
        `[events] credential ${credentialRecord.id}: ${previousState ?? '∅'} → ${credentialRecord.state}`
      )

      // The portal treats the done state as proof the wallet stored the credential.
      void webhookDispatcher({
        connectionId: credentialRecord.connectionId,
        credentialExchangeId: credentialRecord.id,
        ...revocationMetadata,
        previousState,
        state: credentialRecord.state,
        timestamp: new Date().toISOString(),
        type: 'credential.stateChanged',
      })
    }
  )
}
