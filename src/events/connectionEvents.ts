/**
 * @fileoverview Observes Credo connection state changes and forwards relevant events to the portal.
 * @module events/connectionEvents
 */

import {
  ConnectionEventTypes,
  type ConnectionStateChangedEvent,
} from '@credo-ts/core'

import type { UniversityAgent } from '../agent'

import { dispatchWebhook } from './webhookDispatcher'

/** Subscribes once to connection changes that the portal needs to observe. */
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
