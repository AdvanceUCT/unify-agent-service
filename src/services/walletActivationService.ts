import type { UniversityAgent } from '../agent'
import { config } from '../config'
import { AppError } from '../errors'

import { CredentialService } from './credentialService'

export type ResolvedWalletActivation = {
  activationId: string
  activationSource: 'token'
  createdAt: string
  credentialExchangeId: string
  invitationId: string
  invitationUrl: string
  issuerLabel: string
  ledgerName: string
  studentId: string
  walletId: string
}

export type CompletedWalletActivation = {
  activationId: string
  completedAt: string
  credentialExchangeId: string
  credentialRecordId: string
  holderConnectionId: string
}

type StoredActivation = ResolvedWalletActivation & {
  completedAt?: string
  credentialRecordId?: string
  holderConnectionId?: string
  token: string
}

const activationStore = new Map<string, StoredActivation>()

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

function attributesForToken(token: string) {
  const studentId = token === 'demo-token' ? config.demoIssuance.studentId : `student-${suffixFor(token)}`

  return {
    studentId,
    walletId: config.demoIssuance.walletId,
    attributes: [
      { name: 'studentId', value: studentId },
      { name: 'studentNumber', value: studentId.replace(/^student-/, '').toUpperCase() },
      { name: 'fullName', value: 'Demo Student' },
      { name: 'institution', value: 'University of Cape Town' },
      { name: 'programme', value: 'BCom Information Systems' },
      { name: 'faculty', value: 'Commerce' },
      { name: 'enrolmentStatus', value: 'active' },
      { name: 'issuedAt', value: new Date().toISOString() },
    ],
  }
}

export class WalletActivationService {
  private readonly credentials: CredentialService

  constructor(agent: UniversityAgent) {
    this.credentials = new CredentialService(agent)
  }

  async resolve(params: { sourceUrl?: string; token?: string }): Promise<ResolvedWalletActivation> {
    const token = params.token?.trim()

    if (!token) {
      throw new AppError(400, 'Activation token is required.')
    }

    if (!config.demoIssuance.credentialDefinitionId) {
      throw new AppError(
        503,
        'DEMO_CREDENTIAL_DEFINITION_ID is required before the issuer can create real credential offers.',
      )
    }

    const issuedCredential = attributesForToken(token)
    const offer = await this.credentials.createOfferInvitation({
      attributes: issuedCredential.attributes,
      credentialDefinitionId: config.demoIssuance.credentialDefinitionId,
    })
    const suffix = suffixFor(token)
    const activation: StoredActivation = {
      activationId: `activation-${suffix}-${Date.now()}`,
      activationSource: 'token',
      createdAt: new Date().toISOString(),
      credentialExchangeId: offer.credentialExchangeId,
      invitationId: invitationIdFromUrl(offer.invitationUrl, `unify-oob-${suffix}`),
      invitationUrl: offer.invitationUrl,
      issuerLabel: config.demoIssuance.issuerLabel,
      ledgerName: config.demoIssuance.ledgerName,
      studentId: issuedCredential.studentId,
      token,
      walletId: issuedCredential.walletId,
    }

    activationStore.set(activation.activationId, activation)

    return activation
  }

  async complete(params: {
    activationId?: string
    credentialRecordId?: string
    holderConnectionId?: string
  }): Promise<CompletedWalletActivation> {
    if (!params.activationId) {
      throw new AppError(400, 'activationId is required.')
    }

    const activation = activationStore.get(params.activationId)

    if (!activation) {
      throw new AppError(404, 'Activation was not found or has expired.')
    }

    if (!params.credentialRecordId || !params.holderConnectionId) {
      throw new AppError(400, 'credentialRecordId and holderConnectionId are required.')
    }

    const completedAt = new Date().toISOString()
    activation.completedAt = completedAt
    activation.credentialRecordId = params.credentialRecordId
    activation.holderConnectionId = params.holderConnectionId
    activationStore.set(activation.activationId, activation)

    return {
      activationId: activation.activationId,
      completedAt,
      credentialExchangeId: activation.credentialExchangeId,
      credentialRecordId: params.credentialRecordId,
      holderConnectionId: params.holderConnectionId,
    }
  }
}
