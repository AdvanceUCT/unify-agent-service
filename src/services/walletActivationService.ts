import type { UniversityAgent } from '../agent'
import { AppError } from '../errors'

import { ActivationStore } from './activationStore'

export type ResolvedWalletActivation = {
  activationId: string
  activationSource: 'token'
  createdAt: string
  credentialExchangeId: string
  expiresAt: string
  invitationId: string
  invitationUrl: string
  issuerLabel: string
  ledgerName: string
  mediatorInvitationUrl?: string
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

function isExpired(expiresAt: string, now = new Date()) {
  return new Date(expiresAt).getTime() <= now.getTime()
}

export class WalletActivationService {
  constructor(
    _agent: UniversityAgent,
    private readonly store = new ActivationStore(),
  ) {}

  async resolve(params: { sourceUrl?: string; token?: string }): Promise<ResolvedWalletActivation> {
    const token = params.token?.trim()

    if (!token) {
      throw new AppError(400, 'Activation token is required.')
    }

    const activation = await this.store.findByToken(token)

    if (!activation) {
      throw new AppError(404, 'Activation token was not found.')
    }

    if (isExpired(activation.expiresAt)) {
      throw new AppError(410, 'Activation token has expired.')
    }

    if (activation.completedAt) {
      throw new AppError(409, 'Activation token has already been completed.')
    }

    return {
      activationId: activation.activationId,
      activationSource: 'token',
      createdAt: activation.createdAt,
      credentialExchangeId: activation.credentialExchangeId,
      expiresAt: activation.expiresAt,
      invitationId: activation.invitationId,
      invitationUrl: activation.invitationUrl,
      issuerLabel: activation.issuerLabel,
      ledgerName: activation.ledgerName,
      mediatorInvitationUrl: activation.mediatorInvitationUrl,
      studentId: activation.studentId,
      walletId: activation.walletId,
    }
  }

  async complete(params: {
    activationId?: string
    credentialRecordId?: string
    holderConnectionId?: string
  }): Promise<CompletedWalletActivation> {
    if (!params.activationId) {
      throw new AppError(400, 'activationId is required.')
    }

    const activation = await this.store.findByActivationId(params.activationId)

    if (!activation) {
      throw new AppError(404, 'Activation was not found or has expired.')
    }

    if (isExpired(activation.expiresAt)) {
      throw new AppError(410, 'Activation token has expired.')
    }

    if (!params.credentialRecordId || !params.holderConnectionId) {
      throw new AppError(400, 'credentialRecordId and holderConnectionId are required.')
    }

    if (activation.completedAt && activation.credentialRecordId && activation.holderConnectionId) {
      return {
        activationId: activation.activationId,
        completedAt: activation.completedAt,
        credentialExchangeId: activation.credentialExchangeId,
        credentialRecordId: activation.credentialRecordId,
        holderConnectionId: activation.holderConnectionId,
      }
    }

    const completedAt = new Date().toISOString()
    const completedActivation = {
      ...activation,
      completedAt,
      credentialRecordId: params.credentialRecordId,
      holderConnectionId: params.holderConnectionId,
    }

    await this.store.save(completedActivation)

    return {
      activationId: activation.activationId,
      completedAt,
      credentialExchangeId: activation.credentialExchangeId,
      credentialRecordId: params.credentialRecordId,
      holderConnectionId: params.holderConnectionId,
    }
  }
}
