import type { UniversityAgent } from '../agent'
import { AppError } from '../errors'

import { SchemaService } from './schemaService'

export type IssuanceSetupInput = {
  issuerDid: string
  schema: {
    name: string
    version: string
    attributes: string[]
  }
  credentialDefinition: {
    tag: string
    supportRevocation?: boolean
  }
  revocation?: {
    tag: string
    maximumCredentialNumber: number
  }
}

export type IssuanceSetupResult = {
  schemaId: string
  credentialDefinitionId: string
  revocationRegistryDefinitionId?: string
  revocationStatusListTimestamp?: number
}

export class IssuanceSetupService {
  private readonly schemas: SchemaService

  constructor(agent: UniversityAgent) {
    this.schemas = new SchemaService(agent)
  }

  /**
   * Admin Portal friendly setup flow for issuance prerequisites.
   *
   * What this method does today:
   *   1. Registers a schema on the ledger.
   *   2. Registers a credential definition for that schema.
   *   3. Optionally registers a revocation registry and initial status list.
   *
   * What it deliberately does not do yet:
   *   - Persist setup ids in an app database.
   *   - Make setup idempotent across retries.
   *   - Create credential offers for students.
   *
   * TODO(AD-71 / Admin Portal contract):
   * If revocation setup fails after the schema and credential definition have
   * been created, the thrown AppError includes those partial ids in `details`.
   * The Admin Portal should surface/store them so the team can retry only the
   * revocation step instead of accidentally creating duplicate ledger objects.
   */
  async setup(params: IssuanceSetupInput): Promise<IssuanceSetupResult> {
    const supportRevocation = params.credentialDefinition.supportRevocation ?? Boolean(params.revocation)

    if (params.revocation && params.credentialDefinition.supportRevocation === false) {
      throw new AppError(400, 'credentialDefinition.supportRevocation cannot be false when revocation is provided.')
    }

    if (supportRevocation && !params.revocation) {
      throw new AppError(400, 'revocation must be provided when credentialDefinition.supportRevocation is true.')
    }

    const schema = await this.schemas.registerSchema({
      issuerDid: params.issuerDid,
      name: params.schema.name,
      version: params.schema.version,
      attributes: params.schema.attributes,
    })

    const credentialDefinition = await this.schemas.registerCredentialDefinition({
      issuerDid: params.issuerDid,
      schemaId: schema.schemaId,
      tag: params.credentialDefinition.tag,
      supportRevocation,
    })

    const result: IssuanceSetupResult = {
      schemaId: schema.schemaId,
      credentialDefinitionId: credentialDefinition.credentialDefinitionId,
    }

    if (!params.revocation) {
      return result
    }

    try {
      const revocation = await this.schemas.registerRevocationRegistry({
        issuerDid: params.issuerDid,
        credentialDefinitionId: credentialDefinition.credentialDefinitionId,
        tag: params.revocation.tag,
        maximumCredentialNumber: params.revocation.maximumCredentialNumber,
      })

      return {
        ...result,
        ...revocation,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new AppError(
        422,
        `Revocation setup failed after schema and credential definition were created: ${message}`,
        result,
      )
    }
  }
}
