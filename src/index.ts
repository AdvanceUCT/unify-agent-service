import 'reflect-metadata'

import { createAgent } from './agent'
import { createApiServer } from './api/server'
import { config } from './config'
import { registerAgentEventHandlers } from './events'

async function main(): Promise<void> {
  const agent = await createAgent()
  console.log(`[agent] initialised — label="${agent.config.label}"`)

  registerAgentEventHandlers(agent)
  console.log('[events] handlers registered (connection, credential)')

  const app = createApiServer(agent)

  app.listen(config.api.port, () => {
    console.log(`[api]   listening on http://0.0.0.0:${config.api.port}`)
    console.log(`[didcomm] inbound transport on http://0.0.0.0:${config.agent.port}`)
  })

  // Graceful shutdown — flush wallet writes and close ledger pool connections.
  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`\n[shutdown] received ${signal}, closing agent...`)
    try {
      await agent.shutdown()
      process.exit(0)
    } catch (err) {
      console.error('[shutdown] error during shutdown', err)
      process.exit(1)
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[fatal] error during startup:', err)
  process.exit(1)
})
