import { Router } from 'express'

import { SchemaService } from '../../services/schemaService'
import type { UniversityAgent } from '../../agent'
import { asyncHandler } from '../middleware/asyncHandler'
import {
  requireBoolean,
  requireObject,
  requirePositiveInteger,
  requireString,
  requireStringArray,
} from '../validation'

export function buildSchemasRouter(agent: UniversityAgent): Router {
  const router = Router()
  const schemas = new SchemaService(agent)

  router.post(
    '/schemas',
    asyncHandler(async (req, res) => {
      // Low-level route for retrying just the schema write.
      const body = requireObject(req.body)
      const result = await schemas.registerSchema({
        issuerDid: requireString(body, 'issuerDid'),
        name: requireString(body, 'name'),
        version: requireString(body, 'version'),
        attributes: requireStringArray(body, 'attributes'),
      })
      res.status(201).json(result)
    })
  )

  router.post(
    '/credential-definitions',
    asyncHandler(async (req, res) => {
      // Cred-def writes bind the public schema to this issuer's signing key.
      const body = requireObject(req.body)
      const result = await schemas.registerCredentialDefinition({
        issuerDid: requireString(body, 'issuerDid'),
        schemaId: requireString(body, 'schemaId'),
        tag: requireString(body, 'tag'),
        supportRevocation: requireBoolean(body, 'supportRevocation'),
      })
      res.status(201).json(result)
    })
  )

  router.post(
    '/credential-definitions/:cdId/revocation-registries',
    asyncHandler(async (req, res) => {
      // Revocation setup is separate because it can fail after the cred-def succeeds.
      const body = requireObject(req.body)
      const result = await schemas.registerRevocationRegistry({
        credentialDefinitionId: req.params.cdId,
        issuerDid: requireString(body, 'issuerDid'),
        tag: requireString(body, 'tag'),
        maximumCredentialNumber: requirePositiveInteger(body, 'maximumCredentialNumber'),
      })
      res.status(201).json(result)
    })
  )

  return router
}
