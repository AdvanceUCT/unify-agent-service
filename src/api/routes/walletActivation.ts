import { Router } from 'express'

import type { UniversityAgent } from '../../agent'
import { WalletActivationService } from '../../services/walletActivationService'
import { asyncHandler } from '../middleware/asyncHandler'
import { optionalString, requireObject } from '../validation'

export function buildWalletActivationRouter(agent: UniversityAgent): Router {
  const router = Router()
  const activations = new WalletActivationService(agent)

  router.post(
    '/resolve',
    asyncHandler(async (req, res) => {
      // This endpoint is public because the activation token is the student's secret.
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
