import type { UniversityAgent } from '../agent'
import { config } from '../config'

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

  async createOfferInvitation(_params: {
    credentialDefinitionId: string
    attributes: Array<{ name: string; value: unknown }>
  }): Promise<{ invitationUrl: string; credentialExchangeId: string; outOfBandId: string }> {
    // AnonCreds attributes are strings on the wire, even when the portal sends numbers.
    const attributes = _params.attributes.map((attribute) => ({
      name: String(attribute.name),
      value: String(attribute.value ?? ''),
    }))

    console.log(
      '[credential-service] issuing attributes',
      attributes.map((attribute) => ({
        name: attribute.name,
        valueType: typeof attribute.value,
      })),
    )

    const { message, credentialRecord } = await this.agent.credentials.createOffer({
      protocolVersion: 'v2',
      credentialFormats: {
        anoncreds: {
          credentialDefinitionId: _params.credentialDefinitionId,
          attributes,
        },
      },
    })

    // Wrap the credential offer in an OOB invitation so the wallet can open it from a link.
    const outOfBandRecord = await this.agent.oob.createInvitation({
      messages: [message],
    })

    return {
      invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({ domain: config.agent.endpoint }),
      credentialExchangeId: credentialRecord.id,
      outOfBandId: outOfBandRecord.id,
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
      outOfBandId: string
    }>
    failures: Array<{ externalId?: string; email?: string; message: string }>
  }> {
    const offers: Array<{
      externalId?: string
      email?: string
      invitationUrl: string
      credentialExchangeId: string
      outOfBandId: string
    }> = []
    const failures: Array<{ externalId?: string; email?: string; message: string }> = []

    for (const student of _params.students) {
      try {
        // Keep going when one student fails so a bad row does not block the whole batch.
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

  async getStatus(_credentialExchangeId: string): Promise<{
    id: string
    state: string
    connectionId?: string
    credentialDefinitionId?: string
    updatedAt: string
  }> {
    const record = await this.agent.credentials.getById(_credentialExchangeId)

    // Return our stable DTO shape, not the full Credo record.
    return {
      id: record.id,
      state: record.state,
      connectionId: record.connectionId,
      credentialDefinitionId: await this.getCredentialDefinitionId(record.id),
      updatedAt: this.toTimestamp(record),
    }
  }

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
