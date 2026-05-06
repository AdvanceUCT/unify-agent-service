import type { UniversityAgent } from '../agent'

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
   * TODO(team):
   *   1. Call `agent.oob.createInvitation({ ...handshakeProtocols, ...messages })`
   *   2. Use `outOfBandInvitation.toUrl({ domain: config.agent.endpoint })`
   *   3. Return both the invitation URL and the OOB record id (caller
   *      will correlate this with the eventual connectionId via events)
   */
  async createInvitation(_params: { label?: string }): Promise<{ invitationUrl: string; outOfBandId: string }> {
    throw new Error('Not implemented: ConnectionService.createInvitation')
  }

  /**
   * List every active DIDComm connection.
   *
   * TODO(team): call `agent.connections.getAll()` and project to a DTO
   * shape suitable for the Admin Portal (id, theirLabel, state, createdAt).
   */
  async listConnections(): Promise<Array<{ id: string; state: string; theirLabel?: string; createdAt: string }>> {
    throw new Error('Not implemented: ConnectionService.listConnections')
  }
}
