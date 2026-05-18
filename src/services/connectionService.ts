import type { UniversityAgent } from '../agent'
import { config } from '../config'

export class ConnectionService {
  constructor(private readonly agent: UniversityAgent) {}

  async createInvitation(_params: { label?: string }): Promise<{ invitationUrl: string; outOfBandId: string }> {
    const outOfBandRecord = await this.agent.oob.createInvitation({
      label: _params.label,
    })

    return {
      invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({ domain: config.agent.endpoint }),
      outOfBandId: outOfBandRecord.id,
    }
  }

  async listConnections(): Promise<Array<{ id: string; state: string; theirLabel?: string; createdAt: string }>> {
    const records = await this.agent.connections.getAll()

    return records.map((record) => ({
      id: record.id,
      state: record.state,
      theirLabel: record.theirLabel,
      createdAt: record.createdAt.toISOString(),
    }))
  }
}
