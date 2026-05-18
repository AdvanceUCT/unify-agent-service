import { Router } from 'express'

import { ConnectionService } from '../../services/connectionService'
import type { UniversityAgent } from '../../agent'
import { asyncHandler } from '../middleware/asyncHandler'
import { optionalString, requireObject } from '../validation'

export function buildConnectionsRouter(agent: UniversityAgent): Router {
  const router = Router()
  const connections = new ConnectionService(agent)

  router.post(
    '/invitations',
    asyncHandler(async (req, res) => {
      // The invitation URL is what gets turned into an email link or QR code.
      const body = requireObject(req.body ?? {})
      const result = await connections.createInvitation({
        label: optionalString(body, 'label'),
      })
      res.status(201).json(result)
    })
  )

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      // This is mostly for admin debugging; real-time status comes from events.
      const result = await connections.listConnections()
      res.json(result)
    })
  )

  return router
}
