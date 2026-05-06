import { Router } from 'express'

import { CredentialService } from '../../services/credentialService'
import { RevocationService } from '../../services/revocationService'
import type { UniversityAgent } from '../../agent'
import { AppError } from '../../errors'
import { asyncHandler } from '../middleware/asyncHandler'
import { optionalString, requireAttributes, requireObject, requireString } from '../validation'

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
      const body = requireObject(req.body)
      const result = await credentials.createOfferInvitation({
        credentialDefinitionId: requireString(body, 'credentialDefinitionId'),
        attributes: requireAttributes(body),
      })
      res.status(201).json(result)
    })
  )

  router.post(
    '/offers/batch',
    asyncHandler(async (req, res) => {
      const body = requireObject(req.body)
      const students = body.students

      if (!Array.isArray(students) || students.length === 0) {
        throw new AppError(400, 'students must be a non-empty array.')
      }

      const result = await credentials.createBatchOfferInvitations({
        credentialDefinitionId: requireString(body, 'credentialDefinitionId'),
        students: students.map((student, index) => {
          const value = requireObject(student, `students[${index}]`)
          return {
            externalId: optionalString(value, 'externalId'),
            email: optionalString(value, 'email'),
            attributes: requireAttributes(value),
          }
        }),
      })

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
      const body = requireObject(req.body ?? {})
      const result = await revocations.revoke({
        credentialExchangeId: req.params.id,
        reason: optionalString(body, 'reason'),
      })
      res.json(result)
    })
  )

  return router
}
