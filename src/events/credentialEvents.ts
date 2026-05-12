import {
  CredentialEventTypes,
  type CredentialStateChangedEvent,
} from '@credo-ts/core'

import type { UniversityAgent } from '../agent'

import { dispatchWebhook } from './webhookDispatcher'

/**
 * Subscribe to credential exchange state changes.
 *
 * State machine (abridged, V2 protocol):
 *   offer-sent → request-received → credential-issued → done
 *
 * `done` is the terminal happy-path state: the wallet has stored the signed
 * VC. The Admin Portal cares about every transition for status display, but
 * specifically `done` is what flips a row from "pending" to "issued".
 */
export function registerCredentialEventHandlers(agent: UniversityAgent): void {
  agent.events.on<CredentialStateChangedEvent>(
    CredentialEventTypes.CredentialStateChanged,
    async ({ payload }) => {
      const { credentialRecord, previousState } = payload

      console.log(
        `[events] credential ${credentialRecord.id}: ${previousState ?? '∅'} → ${credentialRecord.state}`
      )

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
