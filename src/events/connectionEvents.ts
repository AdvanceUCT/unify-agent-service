import {
  ConnectionEventTypes,
  type ConnectionStateChangedEvent,
} from '@credo-ts/core'

import type { UniversityAgent } from '../agent'

import { dispatchWebhook } from './webhookDispatcher'

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

      void dispatchWebhook({
        connectionId: connectionRecord.id,
        outOfBandId: connectionRecord.outOfBandId,
        previousState,
        state: connectionRecord.state,
        theirLabel: connectionRecord.theirLabel,
        timestamp: new Date().toISOString(),
        type: 'connection.stateChanged',
      })
    }
  )
}
