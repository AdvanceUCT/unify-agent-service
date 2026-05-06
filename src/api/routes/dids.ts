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
      // TODO(AD-69 / DID owner): replace this raw body pass-through with a
      // small validator before implementing the service method.
      //
      // Expected input for local BCovrin Test bootstrap:
      //   { seed: string; endorserDid?: string }
      //
      // Human + AI handoff notes:
      //   - Treat `seed` like a secret. Never log it, echo it in errors, or
      //     return it to the Admin Portal.
      //   - Validate length/shape here so DidService can assume trusted input.
      //   - Decide idempotency before wiring the Admin Portal: either return
      //     the existing issuer DID on repeat calls or return a 409 with a
      //     clear "issuer DID already exists" message. Do not silently create
      //     multiple issuer DIDs for the same university wallet.
      const result = await dids.createIssuerDid(req.body)
      res.status(201).json(result)
    })
  )

  return router
}
