import type { UniversityAgent } from '../agent'
import { config } from '../config'
import { AppError } from '../errors'

import { RevocationIndexStore } from './revocationIndexStore'

export class CredentialService {
  constructor(
    private readonly agent: UniversityAgent,
    private readonly revocationIndexes = new RevocationIndexStore(),
  ) {}

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
    revocationRegistryDefinitionId?: string
    attributes: Array<{ name: string; value: unknown }>
  }): Promise<{
    invitationUrl: string
    credentialExchangeId: string
    credentialRevocationId?: string
    outOfBandId: string
    revocationRegistryDefinitionId?: string
  }> {
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

    const revocation = _params.revocationRegistryDefinitionId
      ? await this.allocateRevocationIndex(
          _params.credentialDefinitionId,
          _params.revocationRegistryDefinitionId,
        )
      : undefined

    const { message, credentialRecord } = await this.agent.credentials.createOffer({
      protocolVersion: 'v2',
      credentialFormats: {
        anoncreds: {
          credentialDefinitionId: _params.credentialDefinitionId,
          ...(revocation
            ? {
                revocationRegistryDefinitionId: revocation.revocationRegistryDefinitionId,
                revocationRegistryIndex: revocation.revocationRegistryIndex,
              }
            : {}),
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
      ...(revocation
        ? {
            credentialRevocationId: revocation.revocationRegistryIndex.toString(),
            revocationRegistryDefinitionId: revocation.revocationRegistryDefinitionId,
          }
        : {}),
    }
  }

  private async allocateRevocationIndex(
    credentialDefinitionId: string,
    revocationRegistryDefinitionId: string,
  ) {
    const result = await this.agent.modules.anoncreds.getRevocationRegistryDefinition(
      revocationRegistryDefinitionId,
    )
    const definition = result.revocationRegistryDefinition
    if (!definition) {
      throw new AppError(422, 'Revocation registry definition could not be resolved.', undefined, 'REVOCATION_REGISTRY_NOT_FOUND')
    }
    if (definition.credDefId !== credentialDefinitionId) {
      throw new AppError(
        409,
        'Revocation registry does not belong to the requested credential definition.',
        undefined,
        'REVOCATION_REGISTRY_CREDENTIAL_DEFINITION_MISMATCH',
      )
    }

    const maximumCredentialNumber = definition.value.maxCredNum
    if (!Number.isSafeInteger(maximumCredentialNumber) || maximumCredentialNumber <= 1) {
      throw new AppError(422, 'Revocation registry has an invalid maximum credential count.')
    }

    return {
      revocationRegistryDefinitionId,
      revocationRegistryIndex: await this.revocationIndexes.reserve(
        revocationRegistryDefinitionId,
        maximumCredentialNumber,
      ),
    }
  }

  async createBatchOfferInvitations(_params: {
    credentialDefinitionId: string
    revocationRegistryDefinitionId?: string
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
      credentialRevocationId?: string
      outOfBandId: string
      revocationRegistryDefinitionId?: string
    }>
    failures: Array<{ externalId?: string; email?: string; message: string }>
  }> {
    const offers: Array<{
      externalId?: string
      email?: string
      invitationUrl: string
      credentialExchangeId: string
      credentialRevocationId?: string
      outOfBandId: string
      revocationRegistryDefinitionId?: string
    }> = []
    const failures: Array<{ externalId?: string; email?: string; message: string }> = []

    for (const student of _params.students) {
      try {
        // Keep going when one student fails so a bad row does not block the whole batch.
        const offer = await this.createOfferInvitation({
          credentialDefinitionId: _params.credentialDefinitionId,
          revocationRegistryDefinitionId: _params.revocationRegistryDefinitionId,
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
