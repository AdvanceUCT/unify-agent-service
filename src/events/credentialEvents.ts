import {
  CredentialEventTypes,
  type CredentialStateChangedEvent,
} from '@credo-ts/core'

import type { UniversityAgent } from '../agent'
import { config } from '../config'

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

      // TODO(AD-73 / status owner): if config.webhooks.url is set, POST a
      // webhook payload here. Polling endpoints are a backstop; this event
      // stream is the best source for real-time Admin Portal updates.
      //
      // Suggested payload:
      //   {
      //     type: 'credential.stateChanged',
      //     credentialExchangeId: credentialRecord.id,
      //     state: credentialRecord.state,
      //     previousState,
      //     connectionId: credentialRecord.connectionId,
      //     credentialDefinitionId: <pull from the cred record's offer attachment>,
      //     timestamp: new Date().toISOString(),
      //   }
      //
      // Completion proof: issue one credential to the student wallet and show
      // the Admin Portal receiving state transitions through to `done`.
      if (config.webhooks.url) {
        // placeholder — implement webhook dispatch here
      }
    }
  )
}
