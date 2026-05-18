import {
  CredentialEventTypes,
  type CredentialStateChangedEvent,
} from '@credo-ts/core'

import type { UniversityAgent } from '../agent'

import { dispatchWebhook } from './webhookDispatcher'

export function registerCredentialEventHandlers(agent: UniversityAgent): void {
  agent.events.on<CredentialStateChangedEvent>(
    CredentialEventTypes.CredentialStateChanged,
    async ({ payload }) => {
      const { credentialRecord, previousState } = payload

      console.log(
        `[events] credential ${credentialRecord.id}: ${previousState ?? '∅'} → ${credentialRecord.state}`
      )

      // The portal treats the done state as proof the wallet stored the credential.
      void dispatchWebhook({
        connectionId: credentialRecord.connectionId,
        credentialExchangeId: credentialRecord.id,
        previousState,
        state: credentialRecord.state,
        timestamp: new Date().toISOString(),
        type: 'credential.stateChanged',
      })
    }
  )
}
