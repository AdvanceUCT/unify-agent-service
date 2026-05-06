import type { UniversityAgent } from '../agent'

/**
 * Credential issuance lifecycle.
 *
 * The high-level flow per project context:
 *
 *   Admin Portal POSTs an issuance request with the student's attribute set
 *     → service creates a credential offer wrapped in an OOB invitation
 *     → email with deep link is sent to student (Admin Portal handles email)
 *     → student taps link, wallet handshakes + accepts offer
 *     → agent issues the signed VC; CredentialStateChanged events fire
 *     → events bubble up to webhooks so the Admin Portal updates status
 *
 * Auto-accept is set to ContentApproved at the module level, so the agent
 * will not block waiting for a manual approval step on the issuer side.
 *
 * Useful Credo references:
 *   - `agent.credentials.createOffer({ protocolVersion, credentialFormats })`
 *   - `agent.oob.createInvitation({ messages: [offerMessage] })`
 *   - `agent.credentials.getById(id)`
 *   - `agent.credentials.getAll()`
 */
export class CredentialService {
  constructor(private readonly agent: UniversityAgent) {}

  /**
   * Create a credential offer + OOB invitation for one student.
   *
   * TODO(team):
   *   1. Build the AnonCreds credential preview from `params.attributes`
   *   2. Call `agent.credentials.createOffer({ protocolVersion: 'v2',
   *        credentialFormats: { anoncreds: { credentialDefinitionId, attributes } } })`
   *   3. Wrap the resulting offer message in an OOB invitation via
   *      `agent.oob.createInvitation({ messages: [offerMessage] })`
   *   4. Render the URL with `outOfBandInvitation.toUrl({ domain })`
   *   5. Return both the URL (for the Admin Portal to email) and the
   *      credentialExchangeId (for status lookups + correlation in events)
   */
  async createOfferInvitation(_params: {
    credentialDefinitionId: string
    attributes: Array<{ name: string; value: string }>
  }): Promise<{ invitationUrl: string; credentialExchangeId: string }> {
    throw new Error('Not implemented: CredentialService.createOfferInvitation')
  }

  /**
   * Look up the current state of a credential exchange.
   *
   * TODO(team): call `agent.credentials.getById(credentialExchangeId)` and
   * project to a DTO shape for the Admin Portal.
   */
  async getStatus(_credentialExchangeId: string): Promise<{
    id: string
    state: string
    connectionId?: string
    credentialDefinitionId?: string
    updatedAt: string
  }> {
    throw new Error('Not implemented: CredentialService.getStatus')
  }

  /**
   * List every credential exchange, optionally filtered by state.
   *
   * TODO(team): call `agent.credentials.getAll()`, optionally filter, and
   * project to DTOs.
   */
  async list(_filter?: { state?: string }): Promise<
    Array<{ id: string; state: string; connectionId?: string; updatedAt: string }>
  > {
    throw new Error('Not implemented: CredentialService.list')
  }
}
