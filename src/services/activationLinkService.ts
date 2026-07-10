import { URLSearchParams } from 'node:url'

import type { UniversityAgent } from '../agent'
import { config } from '../config'

import {
  ActivationStore,
  generateActivationId,
  generateActivationToken,
  hashActivationToken,
  type StoredActivationRecord,
} from './activationStore'
import { CredentialService, withRevocationRegistryDefinitionId } from './credentialService'

type StudentActivationInput = {
  attributes: Array<{ name: string; value: string }>
  email?: string
  externalId?: string
}

type CredentialOfferInput = Parameters<CredentialService['createOfferInvitation']>[0]

export type BatchActivationLinkResult = {
  failures: Array<{ email?: string; externalId?: string; message: string }>
  offers: Array<{
    activationId: string
    activationUrl: string
    credentialExchangeId: string
    credentialRevocationId?: string
    outOfBandId: string
    revocationRegistryDefinitionId?: string
    email?: string
    expiresAt: string
    externalId?: string
  }>
}

function suffixFor(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'demo'
}

function invitationIdFromUrl(invitationUrl: string, fallback: string) {
  try {
    const parsed = new URL(invitationUrl)
    const oob = parsed.searchParams.get('oob')
    return oob ? `oob-${suffixFor(oob)}` : fallback
  } catch {
    return fallback
  }
}

function activationUrlForToken(token: string): string {
  // The student receives the tokenized app link, not the raw OOB invitation.
  return `${config.activations.walletActivationRoute}?${new URLSearchParams({ token }).toString()}`
}

function expiresAtFrom(createdAt: Date): string {
  const expiresAt = new Date(createdAt)
  expiresAt.setHours(expiresAt.getHours() + config.activations.tokenTtlHours)
  return expiresAt.toISOString()
}

function optionalStringProperty(value: object, key: string): string | undefined {
  const property = (value as Record<string, unknown>)[key]
  return typeof property === 'string' && property ? property : undefined
}

export class ActivationLinkService {
  private readonly credentials: CredentialService

  constructor(
    agent: UniversityAgent,
    private readonly store = new ActivationStore(),
  ) {
    this.credentials = new CredentialService(agent)
  }

  async createBatchActivationLinks(params: {
    credentialDefinitionId: string
    revocationRegistryDefinitionId?: string
    students: StudentActivationInput[]
  }): Promise<BatchActivationLinkResult> {
    const offers: BatchActivationLinkResult['offers'] = []
    const failures: BatchActivationLinkResult['failures'] = []

    for (const student of params.students) {
      try {
        const input: {
          credentialDefinitionId: string
          revocationRegistryDefinitionId?: string
          student: StudentActivationInput
        } = {
          credentialDefinitionId: params.credentialDefinitionId,
          student,
        }
        const offer = await this.createActivationLink(
          withRevocationRegistryDefinitionId(input, params.revocationRegistryDefinitionId),
        )
        offers.push(offer)
      } catch (error) {
        failures.push({
          ...(student.email ? { email: student.email } : {}),
          ...(student.externalId ? { externalId: student.externalId } : {}),
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { offers, failures }
  }

  private async createActivationLink(params: {
    credentialDefinitionId: string
    revocationRegistryDefinitionId?: string
    student: StudentActivationInput
  }): Promise<BatchActivationLinkResult['offers'][number]> {
    const token = generateActivationToken()
    const activationId = generateActivationId()
    const createdAt = new Date()
    const input: CredentialOfferInput = {
      attributes: params.student.attributes,
      credentialDefinitionId: params.credentialDefinitionId,
    }
    const offer = await this.credentials.createOfferInvitation(
      withRevocationRegistryDefinitionId(input, params.revocationRegistryDefinitionId),
    )
    const credentialRevocationId = optionalStringProperty(offer, 'credentialRevocationId')
    const revocationRegistryDefinitionId = optionalStringProperty(offer, 'revocationRegistryDefinitionId')
    const invitationId = invitationIdFromUrl(offer.invitationUrl, `unify-oob-${suffixFor(activationId)}`)
    const expiresAt = expiresAtFrom(createdAt)
    // Only the token hash is stored so a leaked activation store cannot open offers.
    const record: StoredActivationRecord = {
      activationId,
      createdAt: createdAt.toISOString(),
      credentialExchangeId: offer.credentialExchangeId,
      expiresAt,
      invitationId,
      invitationUrl: offer.invitationUrl,
      issuerLabel: config.activations.issuerLabel,
      tokenHash: hashActivationToken(token),
    }
    if (credentialRevocationId) {
      record.credentialRevocationId = credentialRevocationId
    }
    if (revocationRegistryDefinitionId) {
      record.revocationRegistryDefinitionId = revocationRegistryDefinitionId
    }

    await this.store.save(record)

    const result: BatchActivationLinkResult['offers'][number] = {
      activationId,
      activationUrl: activationUrlForToken(token),
      credentialExchangeId: offer.credentialExchangeId,
      outOfBandId: offer.outOfBandId,
      expiresAt,
      ...(params.student.email ? { email: params.student.email } : {}),
      ...(params.student.externalId ? { externalId: params.student.externalId } : {}),
    }
    if (credentialRevocationId) {
      result.credentialRevocationId = credentialRevocationId
    }
    if (revocationRegistryDefinitionId) {
      result.revocationRegistryDefinitionId = revocationRegistryDefinitionId
    }

    return result
  }
}
