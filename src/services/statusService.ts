import type { UniversityAgent } from '../agent'
import { indyNetworks } from '../agent/networks'

export interface AgentStatus {
  status: 'ok' | 'degraded'
  agentLabel: string
  isInitialized: boolean
  ledger: {
    indyNamespace: string
    connectOnStartup: boolean
    reachable: boolean
    error?: string
  }
  timestamp: string
}

export class StatusService {
  constructor(private readonly agent: UniversityAgent) {}

  /**
   * TODO(AD-68 + AD-74):
   * This endpoint is the team's quickest distinction between "the service
   * booted" and "the service can actually talk to the ledger". `health` only
   * checks process/agent initialization; this method also refreshes the Indy
   * VDR pool connection.
   *
   * Before marking the status work complete, verify all of the following from
   * a clean Docker start:
   *   - `docker compose up --build -d` starts the agent
   *   - `GET /api/health` returns `{ status: "ok", isInitialized: true }`
   *   - authenticated `GET /api/status` returns `status: "ok"`
   *   - `ledger.reachable` is true for `bcovrin:test`
   *
   * If this reports `Pool timeout: Request was interrupted`, treat it as a
   * ledger/network/genesis configuration problem first, not as proof that the
   * Express API or Credo modules are miswired.
   */
  async getStatus(): Promise<AgentStatus> {
    const [network] = indyNetworks
    const ledger = {
      indyNamespace: network.indyNamespace,
      connectOnStartup: network.connectOnStartup === true,
      reachable: false,
      error: undefined as string | undefined,
    }

    try {
      const results = await this.agent.modules.indyVdr.refreshPoolConnections()
      const rejected = results.find((result) => result.status === 'rejected')
      ledger.reachable = results.length > 0 && !rejected
      if (rejected) {
        ledger.error = rejected.reason instanceof Error ? rejected.reason.message : String(rejected.reason)
      }
    } catch (error) {
      ledger.error = error instanceof Error ? error.message : String(error)
    }

    return {
      status: this.agent.isInitialized && ledger.reachable ? 'ok' : 'degraded',
      agentLabel: this.agent.config.label,
      isInitialized: this.agent.isInitialized,
      ledger,
      timestamp: new Date().toISOString(),
    }
  }
}
