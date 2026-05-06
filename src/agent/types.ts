import type { Agent } from '@credo-ts/core'

import type { AgentModules } from './modules'

/**
 * The fully-typed Credo agent for this service.
 *
 * Capturing the module map in the generic gives IntelliSense for everything
 * we registered — e.g. `agent.modules.anoncreds.registerSchema(...)`,
 * `agent.modules.dids.create(...)`, etc.
 */
export type UniversityAgent = Agent<AgentModules>
