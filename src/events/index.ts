/**
 * @fileoverview Registers every Credo event listener required by the running service.
 * @module events
 */

import type { UniversityAgent } from '../agent'

import { registerConnectionEventHandlers } from './connectionEvents'
import { registerCredentialEventHandlers } from './credentialEvents'
import { registerProofEventHandlers } from './proofEvents'

/** Registers connection, credential, and proof listeners for one agent instance. */
export function registerAgentEventHandlers(agent: UniversityAgent): void {
  // Register listeners before inbound traffic starts producing state changes.
  registerConnectionEventHandlers(agent)
  registerCredentialEventHandlers(agent)
  registerProofEventHandlers(agent)
}
