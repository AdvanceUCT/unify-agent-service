import { Router } from 'express'

import type { UniversityAgent } from '../../agent'
import { IssuanceSetupService } from '../../services/issuanceSetupService'
import { asyncHandler } from '../middleware/asyncHandler'
import {
  optionalBoolean,
  requireObject,
  requirePositiveInteger,
  requireString,
  requireStringArray,
} from '../validation'

/**
 * Admin Portal issuance setup orchestration.
 *
 *   POST /api/issuance/setup
 *     body: {
 *       issuerDid,
 *       schema: { name, version, attributes },
 *       credentialDefinition: { tag, supportRevocation? },
 *       revocation?: { tag, maximumCredentialNumber }
 *     }
 *     -> { schemaId, credentialDefinitionId, revocationRegistryDefinitionId? }
 *
 * This is the preferred Admin Portal endpoint for AD-70/AD-71 because it
 * reduces the number of UI calls needed to bootstrap issuance. The lower-level
 * schema / credential-definition routes still exist for manual retries and
 * debugging when one ledger write succeeds and a later step fails.
 */
export function buildIssuanceRouter(agent: UniversityAgent): Router {
  const router = Router()
  const issuance = new IssuanceSetupService(agent)

  router.post(
    '/setup',
    asyncHandler(async (req, res) => {
      const body = requireObject(req.body)
      const schema = requireObject(body.schema, 'schema')
      const credentialDefinition = requireObject(body.credentialDefinition, 'credentialDefinition')
      const revocation = body.revocation === undefined ? undefined : requireObject(body.revocation, 'revocation')

      const result = await issuance.setup({
        issuerDid: requireString(body, 'issuerDid'),
        schema: {
          name: requireString(schema, 'name'),
          version: requireString(schema, 'version'),
          attributes: requireStringArray(schema, 'attributes'),
        },
        credentialDefinition: {
          tag: requireString(credentialDefinition, 'tag'),
          supportRevocation: optionalBoolean(credentialDefinition, 'supportRevocation'),
        },
        revocation: revocation
          ? {
              tag: requireString(revocation, 'tag'),
              maximumCredentialNumber: requirePositiveInteger(revocation, 'maximumCredentialNumber'),
            }
          : undefined,
      })

      res.status(201).json(result)
    }),
  )

  return router
}
