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

  async getStatus(): Promise<AgentStatus> {
    const [network] = indyNetworks
    const ledger = {
      indyNamespace: network.indyNamespace,
      connectOnStartup: network.connectOnStartup === true,
      reachable: false,
      error: undefined as string | undefined,
    }

    try {
      // Health only proves boot; status also checks whether the ledger pool responds.
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
