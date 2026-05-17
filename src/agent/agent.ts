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

  // DIDComm comes in over HTTP, while outbound messages may use HTTP or WS.
  agent.registerInboundTransport(new HttpInboundTransport({ port: config.agent.port }))
  agent.registerOutboundTransport(new HttpOutboundTransport())
  agent.registerOutboundTransport(new WsOutboundTransport())

  await agent.initialize()

  return agent
}
