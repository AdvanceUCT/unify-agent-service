/**
 * @fileoverview Defines administrator and vendor endpoints for service points, trust policy,
 * proof sessions, checkout claims, and verification results.
 * @module api/routes/verifier
 */

import { Router } from 'express'

import type { UniversityAgent } from '../../agent'
import { AppError } from '../../errors'
import { VerificationService } from '../../services/verificationService'
import { asyncHandler } from '../middleware/asyncHandler'
import { optionalBoolean, optionalString, requireObject, requireString } from '../validation'

type VerifierRouteService = Pick<
  VerificationService,
  | 'createServicePoint'
  | 'createCheckoutSession'
  | 'getServicePoint'
  | 'getInPersonDetails'
  | 'getResult'
  | 'listServicePoints'
  | 'listSessions'
  | 'listTrustedCredentialDefinitions'
  | 'registerTrustedCredentialDefinition'
  | 'updateServicePoint'
>

/** Builds the privileged verifier-management and vendor result routes. */
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
        credentialDefinitionId: optionalString(body, 'credentialDefinitionId'),
      })
      res.status(201).json(result)
    }),
  )

  router.get(
    '/credential-definitions',
    asyncHandler(async (_req, res) => {
      res.json(await verifier.listTrustedCredentialDefinitions())
    }),
  )

  router.post(
    '/checkout-sessions',
    asyncHandler(async (req, res) => {
      const body = requireObject(req.body)
      const result = await verifier.createCheckoutSession({
        vendorId: requireString(body, 'vendorId'),
        servicePointId: requireString(body, 'servicePointId'),
        checkoutId: requireString(body, 'checkoutId'),
      })
      res.status(201).json(result)
    }),
  )

  router.post(
    '/credential-definitions',
    asyncHandler(async (req, res) => {
      const body = requireObject(req.body)
      const result = await verifier.registerTrustedCredentialDefinition({
        credentialDefinitionId: requireString(body, 'credentialDefinitionId'),
        makeDefault: optionalBoolean(body, 'makeDefault'),
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
      const credentialDefinitionId = optionalString(body, 'credentialDefinitionId')
      if (name === undefined && vendorName === undefined && active === undefined && credentialDefinitionId === undefined) {
        throw new AppError(
          400,
          'Provide name, vendorName, active, or credentialDefinitionId to update.',
          undefined,
          'EMPTY_UPDATE',
        )
      }

      res.json(
        await verifier.updateServicePoint(req.params.id, {
          name,
          vendorName,
          active,
          credentialDefinitionId,
        }),
      )
    }),
  )

  router.get(
    '/proof-requests/:id/details',
    asyncHandler(async (req, res) => {
      res.json(await verifier.getInPersonDetails(req.params.id))
    }),
  )

  router.get(
    '/proof-requests/:id',
    asyncHandler(async (req, res) => {
      res.json(await verifier.getResult(req.params.id))
    }),
  )

  return router
}
