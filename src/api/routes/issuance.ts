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

export function buildIssuanceRouter(agent: UniversityAgent): Router {
  const router = Router()
  const issuance = new IssuanceSetupService(agent)

  router.post(
    '/setup',
    asyncHandler(async (req, res) => {
      // The portal uses this to bootstrap schema, cred-def, and optional revocation together.
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
