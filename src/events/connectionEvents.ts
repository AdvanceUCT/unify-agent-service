import {
  ConnectionEventTypes,
  type ConnectionStateChangedEvent,
} from '@credo-ts/core'

import type { UniversityAgent } from '../agent'

import { dispatchWebhook } from './webhookDispatcher'

export function registerConnectionEventHandlers(agent: UniversityAgent): void {
  agent.events.on<ConnectionStateChangedEvent>(
    ConnectionEventTypes.ConnectionStateChanged,
    async ({ payload }) => {
      const { connectionRecord, previousState } = payload

      console.log(
        `[events] connection ${connectionRecord.id}: ${previousState ?? '∅'} → ${connectionRecord.state}`
      )

      // Webhooks are fire-and-forget so Credo event processing is not blocked.
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
