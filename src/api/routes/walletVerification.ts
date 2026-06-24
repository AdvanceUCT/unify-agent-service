import { Router } from 'express'

import type { UniversityAgent } from '../../agent'
import { VerificationService } from '../../services/verificationService'
import { asyncHandler } from '../middleware/asyncHandler'
import { requireObject, requireString } from '../validation'

type WalletVerificationRouteService = Pick<VerificationService, 'getWalletResult' | 'startSession'>

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined
  const [scheme, token, extra] = header.trim().split(/\s+/)
  return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : undefined
}

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

  router.get(
    '/sessions/:verificationRequestId',
    asyncHandler(async (req, res) => {
      const result = await verifier.getWalletResult(
        req.params.verificationRequestId,
        bearerToken(req.header('authorization')),
      )
      res.json(result)
    }),
  )

  return router
}
