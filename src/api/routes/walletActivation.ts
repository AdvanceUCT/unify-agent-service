import { Router } from 'express'

import type { UniversityAgent } from '../../agent'
import { WalletActivationService } from '../../services/walletActivationService'
import { asyncHandler } from '../middleware/asyncHandler'
import { optionalString, requireObject } from '../validation'

/**
 * Student wallet activation bridge.
 *
 * These endpoints are called by the mobile wallet after a student opens an
 * activation deep link. They intentionally do not require the Admin Portal API
 * key because the activation token is the student-facing bearer secret.
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

  router.post(
    '/complete',
    asyncHandler(async (req, res) => {
      const body = requireObject(req.body)
      const result = await activations.complete({
        activationId: optionalString(body, 'activationId'),
        credentialRecordId: optionalString(body, 'credentialRecordId'),
        holderConnectionId: optionalString(body, 'holderConnectionId'),
      })

      res.json(result)
    }),
  )

  return router
}
