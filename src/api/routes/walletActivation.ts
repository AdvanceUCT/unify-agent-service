import { Router } from 'express'

import type { UniversityAgent } from '../../agent'
import { WalletActivationService } from '../../services/walletActivationService'
import { asyncHandler } from '../middleware/asyncHandler'
import { optionalString, requireObject } from '../validation'

/**
 * Student wallet activation bridge.
 *
 *   POST /api/wallet/activation/resolve
 *     body: { token, sourceUrl? }
 *     -> { activationId, activationSource, createdAt, credentialExchangeId,
 *          expiresAt, invitationId, invitationUrl, issuerLabel }
 *
 * The /resolve endpoint is intentionally unauthenticated by API key — the
 * activation token is the student-facing bearer secret. Issuance terminal
 * state is observed via Credo `CredentialStateChanged` events; the wallet
 * does not call back to mark activation complete.
 */
export function buildWalletActivationRouter(agent: UniversityAgent): Router {
  const router = Router()
  const activations = new WalletActivationService(agent)

  router.post(
    '/resolve',
    asyncHandler(async (req, res) => {
      const body = requireObject(req.body)
      const result = await activations.resolve({
        sourceUrl: optionalString(body, 'sourceUrl'),
        token: optionalString(body, 'token'),
      })

      res.status(201).json(result)
    }),
  )

  return router
}
