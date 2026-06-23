import { Router } from 'express'

import type { UniversityAgent } from '../../agent'
import { VerificationService } from '../../services/verificationService'
import { asyncHandler } from '../middleware/asyncHandler'
import { requireObject, requireString } from '../validation'

type WalletVerificationRouteService = Pick<VerificationService, 'startSession'>

export function buildWalletVerificationRouter(
  agent: UniversityAgent,
  verifier: WalletVerificationRouteService = new VerificationService(agent),
): Router {
  const router = Router()

  router.post(
    '/sessions',
    asyncHandler(async (req, res) => {
      const body = requireObject(req.body)
      const result = await verifier.startSession({
        publicServicePointId: requireString(body, 'publicServicePointId'),
        clientRequestId: requireString(body, 'clientRequestId'),
        requestIp: req.ip || req.socket.remoteAddress || 'unknown',
      })
      res.status(201).json(result)
    }),
  )

  return router
}
