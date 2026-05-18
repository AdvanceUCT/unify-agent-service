import type { UniversityAgent } from '../agent'

import { registerConnectionEventHandlers } from './connectionEvents'
import { registerCredentialEventHandlers } from './credentialEvents'

export function registerAgentEventHandlers(agent: UniversityAgent): void {
  // Register listeners before inbound traffic starts producing state changes.
  registerConnectionEventHandlers(agent)
  registerCredentialEventHandlers(agent)
}
