import { Router } from 'express'

import { DidService } from '../../services/didService'
import type { UniversityAgent } from '../../agent'
import { AppError } from '../../errors'
import { asyncHandler } from '../middleware/asyncHandler'
import { optionalString, requireObject } from '../validation'

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
      // The key seed is generated in the service, never accepted from the API.
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
