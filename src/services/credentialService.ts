/**
 * @fileoverview Creates credential offers and exposes issuer-side exchange state to the API.
 * @module services/credentialService
 */

import type { UniversityAgent } from '../agent'
import { config } from '../config'
import { AppError } from '../errors'

import { mapWithConcurrency } from './batchConcurrency'
import { RevocationIndexStore } from './revocationIndexStore'

export type CredentialOfferInvitationInput = {
  credentialDefinitionId: string
  revocationRegistryDefinitionId?: string
  attributes: Array<{ name: string; value: unknown }>
}

export type CredentialOfferInvitationResult = {
  invitationUrl: string
  credentialExchangeId: string
  credentialRevocationId?: string
  outOfBandId: string
  revocationRegistryDefinitionId?: string
}

function withRevocationRegistryDefinitionId<T extends object>(
  input: T,
  revocationRegistryDefinitionId?: string,
): T & { revocationRegistryDefinitionId?: string } {
  if (revocationRegistryDefinitionId) {
    ;(input as Record<string, unknown>).revocationRegistryDefinitionId = revocationRegistryDefinitionId
  }

  return input as T & { revocationRegistryDefinitionId?: string }
}

/** Owns issuer-side offer creation and credential exchange queries. */
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

  async createOfferInvitation(params: CredentialOfferInvitationInput): Promise<CredentialOfferInvitationResult> {
    const [revocation] = await this.prepareRevocationIndexes(
      params.credentialDefinitionId,
      params.revocationRegistryDefinitionId,
      1,
    )
    return this.createOfferInvitationWithRevocation(params, revocation)
  }

  private async createOfferInvitationWithRevocation(
    params: CredentialOfferInvitationInput,
    revocation?: { revocationRegistryDefinitionId: string; revocationRegistryIndex: number },
  ): Promise<CredentialOfferInvitationResult> {
    // AnonCreds attributes are strings on the wire, even when the portal sends numbers.
    const attributes = params.attributes.map((attribute) => ({
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
          credentialDefinitionId: params.credentialDefinitionId,
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

    const result: CredentialOfferInvitationResult = {
      invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({ domain: config.agent.endpoint }),
      credentialExchangeId: credentialRecord.id,
      outOfBandId: outOfBandRecord.id,
    }
    if (revocation) {
      result.credentialRevocationId = revocation.revocationRegistryIndex.toString()
      result.revocationRegistryDefinitionId = revocation.revocationRegistryDefinitionId
    }

    return result
  }

  private async prepareRevocationIndexes(
    credentialDefinitionId: string,
    revocationRegistryDefinitionId: string | undefined,
    count: number,
  ): Promise<Array<{ revocationRegistryDefinitionId: string; revocationRegistryIndex: number } | undefined>> {
    if (!revocationRegistryDefinitionId || count === 0) {
      return Array.from({ length: count }, () => undefined)
    }

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

    const indexes = await this.revocationIndexes.reserveRange(
      revocationRegistryDefinitionId,
      count,
      maximumCredentialNumber,
    )
    return indexes.map((revocationRegistryIndex) => ({
      revocationRegistryDefinitionId,
      revocationRegistryIndex,
    }))
  }

  async createBatchOfferResults(params: {
    credentialDefinitionId: string
    revocationRegistryDefinitionId?: string
    students: Array<{
      externalId?: string
      email?: string
      attributes: Array<{ name: string; value: string }>
    }>
  }): Promise<Array<{
    student: {
      externalId?: string
      email?: string
      attributes: Array<{ name: string; value: string }>
    }
    offer?: CredentialOfferInvitationResult
    message?: string
  }>> {
    const revocations = await this.prepareRevocationIndexes(
      params.credentialDefinitionId,
      params.revocationRegistryDefinitionId,
      params.students.length,
    )

    return mapWithConcurrency(
      params.students,
      config.activations.batchConcurrency,
      async (student, index) => {
        const input: CredentialOfferInvitationInput = {
          credentialDefinitionId: params.credentialDefinitionId,
          attributes: student.attributes,
        }

        try {
          const offer = await this.createOfferInvitationWithRevocation(
            withRevocationRegistryDefinitionId(input, params.revocationRegistryDefinitionId),
            revocations[index],
          )
          return { offer, student }
        } catch (error) {
          return {
            message: error instanceof Error ? error.message : String(error),
            student,
          }
        }
      },
    )
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

    const results = await this.createBatchOfferResults(_params)
    for (const result of results) {
      if (result.offer) {
        offers.push({
          externalId: result.student.externalId,
          email: result.student.email,
          ...result.offer,
        })
      } else {
        failures.push({
          externalId: result.student.externalId,
          email: result.student.email,
          message: result.message ?? 'Credential offer creation failed.',
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
