import { Router } from 'express'

import type { UniversityAgent } from '../../agent'
import { AppError } from '../../errors'
import { VerificationService } from '../../services/verificationService'
import { asyncHandler } from '../middleware/asyncHandler'
import { optionalBoolean, optionalString, requireObject, requireString } from '../validation'

type VerifierRouteService = Pick<
  VerificationService,
  'createServicePoint' | 'listServicePoints' | 'listSessions' | 'getServicePoint' | 'updateServicePoint' | 'getStatus'
>

export function buildVerifierRouter(
  agent: UniversityAgent,
  verifier: VerifierRouteService = new VerificationService(agent),
): Router {
  const router = Router()

  router.post(
    '/service-points',
    asyncHandler(async (req, res) => {
      const body = requireObject(req.body)
      const result = await verifier.createServicePoint({
        vendorId: requireString(body, 'vendorId'),
        vendorName: requireString(body, 'vendorName'),
        externalId: requireString(body, 'externalId'),
        name: requireString(body, 'name'),
      })
      res.status(201).json(result)
    }),
  )

  router.get(
    '/service-points',
    asyncHandler(async (_req, res) => {
      res.json(await verifier.listServicePoints())
    }),
  )

  router.get(
    '/service-points/:id/sessions',
    asyncHandler(async (req, res) => {
      res.json(await verifier.listSessions(req.params.id))
    }),
  )

  router.get(
    '/service-points/:id',
    asyncHandler(async (req, res) => {
      res.json(await verifier.getServicePoint(req.params.id))
    }),
  )

  router.patch(
    '/service-points/:id',
    asyncHandler(async (req, res) => {
      const body = requireObject(req.body)
      const name = optionalString(body, 'name')
      const vendorName = optionalString(body, 'vendorName')
      const active = optionalBoolean(body, 'active')
      if (name === undefined && vendorName === undefined && active === undefined) {
        throw new AppError(400, 'Provide name, vendorName, or active to update.', undefined, 'EMPTY_UPDATE')
      }

      res.json(await verifier.updateServicePoint(req.params.id, { name, vendorName, active }))
    }),
  )

  router.get(
    '/proof-requests/:id',
    asyncHandler(async (req, res) => {
      res.json(await verifier.getStatus(req.params.id))
    }),
  )

  return router
}
