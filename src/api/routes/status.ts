/**
 * @fileoverview Returns operational agent, wallet, mediator, and ledger status information.
 * @module api/routes/status
 */

import { Router } from 'express'

import type { UniversityAgent } from '../../agent'
import { StatusService } from '../../services/statusService'
import { asyncHandler } from '../middleware/asyncHandler'

/** Builds the authenticated operational-status endpoint. */
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
