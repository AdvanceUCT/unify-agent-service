import {
  ConnectionEventTypes,
  type ConnectionStateChangedEvent,
} from '@credo-ts/core'

import type { UniversityAgent } from '../agent'
import { config } from '../config'

/**
 * Subscribe to DIDComm connection state changes.
 *
 * State machine (abridged):
 *   invited → request-received → response-sent → completed
 *
 * The Admin Portal cares mostly about `completed` (a student has linked
 * their wallet to the OOB invitation we emailed them) so it can light up
 * the issuance row in real time.
 */
export function registerConnectionEventHandlers(agent: UniversityAgent): void {
  agent.events.on<ConnectionStateChangedEvent>(
    ConnectionEventTypes.ConnectionStateChanged,
    async ({ payload }) => {
      const { connectionRecord, previousState } = payload

      console.log(
        `[events] connection ${connectionRecord.id}: ${previousState ?? '∅'} → ${connectionRecord.state}`
      )

      // TODO(team): if config.webhooks.url is set, POST a webhook payload here:
      //   {
      //     type: 'connection.stateChanged',
      //     connectionId: connectionRecord.id,
      //     state: connectionRecord.state,
      //     previousState,
      //     theirLabel: connectionRecord.theirLabel,
      //     outOfBandId: connectionRecord.outOfBandId,
      //     timestamp: new Date().toISOString(),
      //   }
      // Recommended: include an HMAC signature header so the Admin Portal
      // can verify the call came from this agent and not a spoofer.
      if (config.webhooks.url) {
        // placeholder — implement webhook dispatch here
      }
    }
  )
}
