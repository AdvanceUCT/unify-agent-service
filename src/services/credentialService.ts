import type { UniversityAgent } from '../agent'
import { config } from '../config'

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

  private toTimestamp(record: { createdAt: Date; updatedAt?: Date }): string {
    return (record.updatedAt ?? record.createdAt).toISOString()
  }

  private async getCredentialDefinitionId(credentialExchangeId: string): Promise<string | undefined> {
    try {
      const formatData = await this.agent.credentials.getFormatData(credentialExchangeId)
      const offer = formatData.offer as { anoncreds?: { cred_def_id?: string } } | undefined
      return offer?.anoncreds?.cred_def_id
    } catch {
      return undefined
    }
  }

  /**
   * Create a credential offer + OOB invitation for one student.
   *
   * Returns both the URL (for the Admin Portal to email) and the
   * credentialExchangeId (for status lookups + correlation in events).
   */
  async createOfferInvitation(_params: {
    credentialDefinitionId: string
    attributes: Array<{ name: string; value: string }>
  }): Promise<{ invitationUrl: string; credentialExchangeId: string }> {
    const { message, credentialRecord } = await this.agent.credentials.createOffer({
      protocolVersion: 'v2',
      credentialFormats: {
        anoncreds: {
          credentialDefinitionId: _params.credentialDefinitionId,
          attributes: _params.attributes,
        },
      },
    })

    const outOfBandRecord = await this.agent.oob.createInvitation({
      messages: [message],
    })

    return {
      invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({ domain: config.agent.endpoint }),
      credentialExchangeId: credentialRecord.id,
    }
  }

  async createBatchOfferInvitations(_params: {
    credentialDefinitionId: string
    students: Array<{
      externalId?: string
      email?: string
      attributes: Array<{ name: string; value: string }>
    }>
  }): Promise<{
    offers: Array<{
      externalId?: string
      email?: string
      invitationUrl: string
      credentialExchangeId: string
    }>
    failures: Array<{ externalId?: string; email?: string; message: string }>
  }> {
    const offers: Array<{
      externalId?: string
      email?: string
      invitationUrl: string
      credentialExchangeId: string
    }> = []
    const failures: Array<{ externalId?: string; email?: string; message: string }> = []

    for (const student of _params.students) {
      try {
        const offer = await this.createOfferInvitation({
          credentialDefinitionId: _params.credentialDefinitionId,
          attributes: student.attributes,
        })
        offers.push({
          externalId: student.externalId,
          email: student.email,
          ...offer,
        })
      } catch (error) {
        failures.push({
          externalId: student.externalId,
          email: student.email,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { offers, failures }
  }

  /**
   * Look up the current state of a credential exchange.
   *
   * Project a Credo credential exchange record to an Admin Portal DTO.
   */
  async getStatus(_credentialExchangeId: string): Promise<{
    id: string
    state: string
    connectionId?: string
    credentialDefinitionId?: string
    updatedAt: string
  }> {
    const record = await this.agent.credentials.getById(_credentialExchangeId)

    return {
      id: record.id,
      state: record.state,
      connectionId: record.connectionId,
      credentialDefinitionId: await this.getCredentialDefinitionId(record.id),
      updatedAt: this.toTimestamp(record),
    }
  }

  /**
   * List every credential exchange, optionally filtered by state.
   *
   * List Credo credential exchanges, optionally filtered by state.
   */
  async list(_filter?: { state?: string }): Promise<
    Array<{ id: string; state: string; connectionId?: string; updatedAt: string }>
  > {
    const records = await this.agent.credentials.getAll()

    return records
      .filter((record) => (_filter?.state ? record.state === _filter.state : true))
      .map((record) => ({
        id: record.id,
        state: record.state,
        connectionId: record.connectionId,
        updatedAt: this.toTimestamp(record),
      }))
  }
}
