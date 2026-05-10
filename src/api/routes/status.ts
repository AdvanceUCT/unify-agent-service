import { Router } from 'express'

import type { UniversityAgent } from '../../agent'
import { StatusService } from '../../services/statusService'
import { asyncHandler } from '../middleware/asyncHandler'

export function buildStatusRouter(agent: UniversityAgent): Router {
  const router = Router()
  const status = new StatusService(agent)

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await status.getStatus())
    })
  )

  return router
}
