import { Router } from 'express'

import { DidService } from '../../services/didService'
import type { UniversityAgent } from '../../agent'
import { asyncHandler } from '../middleware/asyncHandler'

/**
 * Issuer DID endpoints.
 *
 *   GET  /api/dids/issuer       returns the university's issuer DID (or 404)
 *   POST /api/dids/issuer       creates the issuer DID (one-time onboarding)
 */
export function buildDidsRouter(agent: UniversityAgent): Router {
  const router = Router()
  const dids = new DidService(agent)

  router.get(
    '/issuer',
    asyncHandler(async (_req, res) => {
      const did = await dids.getIssuerDid()
      if (!did) {
        res.status(404).json({ error: { message: 'Issuer DID has not been created yet.' } })
        return
      }
      res.json({ did })
    })
  )

  router.post(
    '/issuer',
    asyncHandler(async (req, res) => {
      // TODO(team): validate req.body { seed: string; endorserDid?: string }
      const result = await dids.createIssuerDid(req.body)
      res.status(201).json(result)
    })
  )

  return router
}
