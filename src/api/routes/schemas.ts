import { Router } from 'express'

import { SchemaService } from '../../services/schemaService'
import type { UniversityAgent } from '../../agent'
import { asyncHandler } from '../middleware/asyncHandler'

/**
 * Schema and credential-definition endpoints.
 *
 *   POST /api/schemas
 *     body: { issuerDid, name, version, attributes }
 *     -> { schemaId }
 *
 *   POST /api/credential-definitions
 *     body: { issuerDid, schemaId, tag, supportRevocation }
 *     -> { credentialDefinitionId }
 *
 *   POST /api/credential-definitions/:cdId/revocation-registries
 *     body: { issuerDid, tag, maximumCredentialNumber }
 *     -> { revocationRegistryDefinitionId }
 */
export function buildSchemasRouter(agent: UniversityAgent): Router {
  const router = Router()
  const schemas = new SchemaService(agent)

  router.post(
    '/schemas',
    asyncHandler(async (req, res) => {
      // TODO(team): validate body
      const result = await schemas.registerSchema(req.body)
      res.status(201).json(result)
    })
  )

  router.post(
    '/credential-definitions',
    asyncHandler(async (req, res) => {
      // TODO(team): validate body
      const result = await schemas.registerCredentialDefinition(req.body)
      res.status(201).json(result)
    })
  )

  router.post(
    '/credential-definitions/:cdId/revocation-registries',
    asyncHandler(async (req, res) => {
      // TODO(team): validate body + use req.params.cdId as credentialDefinitionId
      const result = await schemas.registerRevocationRegistry({
        credentialDefinitionId: req.params.cdId,
        ...req.body,
      })
      res.status(201).json(result)
    })
  )

  return router
}
