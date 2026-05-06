import { Router } from 'express'

import { ConnectionService } from '../../services/connectionService'
import type { UniversityAgent } from '../../agent'
import { asyncHandler } from '../middleware/asyncHandler'
import { optionalString, requireObject } from '../validation'

/**
 * DIDComm connection endpoints.
 *
 *   POST /api/connections/invitations
 *     body: { label?: string }
 *     -> { invitationUrl, outOfBandId }
 *
 *   GET  /api/connections
 *     -> [{ id, state, theirLabel?, createdAt }]
 *
 * Note: connection acceptance happens automatically inside the agent because
 * `autoAcceptConnections: true` is set on the ConnectionsModule (see
 * `src/agent/modules.ts`). Status surfaces via webhook events, not polling.
 */
export function buildConnectionsRouter(agent: UniversityAgent): Router {
  const router = Router()
  const connections = new ConnectionService(agent)

  router.post(
    '/invitations',
    asyncHandler(async (req, res) => {
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
      const result = await connections.listConnections()
      res.json(result)
    })
  )

  return router
}
