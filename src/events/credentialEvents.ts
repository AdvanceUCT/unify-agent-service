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

      // TODO(team): if config.webhooks.url is set, POST a webhook payload here:
      //   {
      //     type: 'credential.stateChanged',
      //     credentialExchangeId: credentialRecord.id,
      //     state: credentialRecord.state,
      //     previousState,
      //     connectionId: credentialRecord.connectionId,
      //     credentialDefinitionId: <pull from the cred record's offer attachment>,
      //     timestamp: new Date().toISOString(),
      //   }
      if (config.webhooks.url) {
        // placeholder — implement webhook dispatch here
      }
    }
  )
}
