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
import { CredentialService } from './credentialService'

type StudentActivationInput = {
  attributes: Array<{ name: string; value: string }>
  email?: string
  externalId?: string
}

export type BatchActivationLinkResult = {
  failures: Array<{ email?: string; externalId?: string; message: string }>
  offers: Array<{
    activationId: string
    activationUrl: string
    credentialExchangeId: string
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
  return `${config.activations.walletActivationRoute}?${new URLSearchParams({ token }).toString()}`
}

function expiresAtFrom(createdAt: Date): string {
  const expiresAt = new Date(createdAt)
  expiresAt.setHours(expiresAt.getHours() + config.activations.tokenTtlHours)
  return expiresAt.toISOString()
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
    students: StudentActivationInput[]
  }): Promise<BatchActivationLinkResult> {
    const offers: BatchActivationLinkResult['offers'] = []
    const failures: BatchActivationLinkResult['failures'] = []

    for (const student of params.students) {
      try {
        const offer = await this.createActivationLink({
          credentialDefinitionId: params.credentialDefinitionId,
          student,
        })
        offers.push(offer)
      } catch (error) {
        failures.push({
          email: student.email,
          externalId: student.externalId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { offers, failures }
  }

  private async createActivationLink(params: {
    credentialDefinitionId: string
    student: StudentActivationInput
  }): Promise<BatchActivationLinkResult['offers'][number]> {
    const token = generateActivationToken()
    const activationId = generateActivationId()
    const createdAt = new Date()
    const offer = await this.credentials.createOfferInvitation({
      attributes: params.student.attributes,
      credentialDefinitionId: params.credentialDefinitionId,
    })
    const invitationId = invitationIdFromUrl(offer.invitationUrl, `unify-oob-${suffixFor(activationId)}`)
    const expiresAt = expiresAtFrom(createdAt)
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

    await this.store.save(record)

    return {
      activationId,
      activationUrl: activationUrlForToken(token),
      credentialExchangeId: offer.credentialExchangeId,
      email: params.student.email,
      expiresAt,
      externalId: params.student.externalId,
    }
  }
}
