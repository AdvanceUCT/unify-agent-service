import { Router } from 'express'

import { CredentialService } from '../../services/credentialService'
import { RevocationService } from '../../services/revocationService'
import type { UniversityAgent } from '../../agent'
import { asyncHandler } from '../middleware/asyncHandler'

/**
 * Credential issuance + revocation endpoints.
 *
 *   POST /api/credentials/offers
 *     body: { credentialDefinitionId, attributes: [{ name, value }] }
 *     -> { invitationUrl, credentialExchangeId }
 *
 *   GET  /api/credentials
 *     query: ?state=offer-sent (optional)
 *     -> [{ id, state, connectionId?, updatedAt }]
 *
 *   GET  /api/credentials/:id
 *     -> { id, state, connectionId?, credentialDefinitionId?, updatedAt }
 *
 *   POST /api/credentials/:id/revoke
 *     body: { reason?: string }
 *     -> { revokedAt }
 */
export function buildCredentialsRouter(agent: UniversityAgent): Router {
  const router = Router()
  const credentials = new CredentialService(agent)
  const revocations = new RevocationService(agent)

  router.post(
    '/offers',
    asyncHandler(async (req, res) => {
      // TODO(team): validate body
      const result = await credentials.createOfferInvitation(req.body)
      res.status(201).json(result)
    })
  )

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const state = typeof req.query.state === 'string' ? req.query.state : undefined
      const result = await credentials.list(state ? { state } : undefined)
      res.json(result)
    })
  )

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const result = await credentials.getStatus(req.params.id)
      res.json(result)
    })
  )

  router.post(
    '/:id/revoke',
    asyncHandler(async (req, res) => {
      // TODO(team): validate body
      const result = await revocations.revoke({
        credentialExchangeId: req.params.id,
        reason: req.body?.reason,
      })
      res.json(result)
    })
  )

  return router
}
