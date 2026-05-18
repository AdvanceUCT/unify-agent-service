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

    // Expired links should fail before the wallet gets the stored OOB invitation.
    if (isExpired(activation.expiresAt)) {
      throw new AppError(410, 'Activation token has expired.')
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
    }
  }
}
