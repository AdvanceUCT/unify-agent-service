import {
  Agent,
  ConsoleLogger,
  HttpOutboundTransport,
  LogLevel,
  WsOutboundTransport,
  type InitConfig,
} from '@credo-ts/core'
import { HttpInboundTransport, agentDependencies } from '@credo-ts/node'

import { config } from '../config'
import { buildAgentModules } from './modules'
import type { UniversityAgent } from './types'

/**
 * Construct, wire transports for, and initialise the Credo agent.
 *
 * Returns the fully-initialised agent so callers can attach event listeners
 * and begin handling requests immediately. The caller is responsible for
 * shutting it down (`agent.shutdown()`) on process exit.
 */
export async function createAgent(): Promise<UniversityAgent> {
  const initConfig: InitConfig = {
    label: config.agent.label,
    walletConfig: {
      id: config.agent.walletId,
      key: config.agent.walletKey,
    },
    endpoints: [config.agent.endpoint],
    logger: new ConsoleLogger(LogLevel.info),
    autoUpdateStorageOnStartup: true,
  }

  const agent = new Agent({
    config: initConfig,
    modules: buildAgentModules(),
    dependencies: agentDependencies,
  })

  agent.registerInboundTransport(new HttpInboundTransport({ port: config.agent.port }))
  agent.registerOutboundTransport(new HttpOutboundTransport())
  agent.registerOutboundTransport(new WsOutboundTransport())

  await agent.initialize()

  return agent
}
