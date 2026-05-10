import type { UniversityAgent } from '../agent'
import { config } from '../config'

/**
 * DIDComm connection lifecycle.
 *
 * Per project context, the only connection-establishment flow is:
 *
 *   Admin clicks issue → agent creates Out-of-Band invitation
 *     → Admin Portal emails student a deep link encoding the OOB invitation
 *     → Student taps link → wallet auto-accepts → DIDComm connection live
 *
 * Auto-accept is enabled at the module level (`autoAcceptConnections: true`
 * in `agent/modules.ts`), so once the wallet processes the invitation a
 * `connectionRecord` materialises and `ConnectionStateChanged` fires.
 *
 * Useful Credo references:
 *   - `agent.oob.createInvitation(...)`     create an OOB record
 *   - `outOfBandRecord.outOfBandInvitation.toUrl({ domain })`
 *                                           render as URL for emailing / QR
 *   - `agent.connections.findAllByOutOfBandId(oobId)`
 *                                           find the connection that came
 *                                           from a given invitation
 *   - `agent.connections.getAll()`          list every connection
 *
 * See https://credo.js.org/guides/tutorials/create-a-connection.
 */
export class ConnectionService {
  constructor(private readonly agent: UniversityAgent) {}

  /**
   * Create an Out-of-Band invitation and return the deep-link URL.
   *
   * Returns both the invitation URL and the OOB record id. Callers correlate
   * the OOB record with the eventual connectionId via events.
   */
  async createInvitation(_params: { label?: string }): Promise<{ invitationUrl: string; outOfBandId: string }> {
    const outOfBandRecord = await this.agent.oob.createInvitation({
      label: _params.label,
    })

    return {
      invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({ domain: config.agent.endpoint }),
      outOfBandId: outOfBandRecord.id,
    }
  }

  /**
   * List every active DIDComm connection.
   *
   * Project Credo connection records to the Admin Portal DTO shape.
   */
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
