import type { Agent } from '@credo-ts/core'

import type { AgentModules } from './modules'

// Keep the module map on the Agent type so service files get the Credo APIs we registered.
export type UniversityAgent = Agent<AgentModules>
