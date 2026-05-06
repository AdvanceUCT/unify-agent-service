import { Router } from 'express'

import { DidService } from '../../services/didService'
import type { UniversityAgent } from '../../agent'
import { AppError } from '../../errors'
import { asyncHandler } from '../middleware/asyncHandler'
import { optionalString, requireObject } from '../validation'

/**
 * Issuer DID endpoints.
 *
 *   GET  /api/dids/issuer   → { did }          200  (or 404 if not yet created)
 *   POST /api/dids/issuer   → { did }          201  (one-time onboarding)
 *                           → { error, did }   409  (DID already exists)
 *
 * POST body: { alias?: string }
 * The seed is generated server-side and never accepted from the caller.
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
    }),
  )

  router.post(
    '/issuer',
    asyncHandler(async (req, res) => {
      const body = requireObject(req.body ?? {})
      const alias = optionalString(body, 'alias')

      try {
        const result = await dids.createIssuerDid({ alias })
        res.status(201).json(result)
      } catch (err) {
        if (err instanceof AppError && err.status === 409) {
          res.status(409).json({
            error: { message: err.message, did: (err as AppError & { did?: string }).did },
          })
          return
        }
        throw err
      }
    }),
  )

  return router
}
