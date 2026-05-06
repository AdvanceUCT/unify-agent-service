import type { UniversityAgent } from '../agent'

import { registerConnectionEventHandlers } from './connectionEvents'
import { registerCredentialEventHandlers } from './credentialEvents'

/**
 * Register every agent event listener.
 *
 * Call this once after the agent is initialised but before it starts
 * processing inbound DIDComm traffic, so we don't miss state changes.
 */
export function registerAgentEventHandlers(agent: UniversityAgent): void {
  registerConnectionEventHandlers(agent)
  registerCredentialEventHandlers(agent)
}
