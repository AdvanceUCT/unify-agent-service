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
      // If this fails, return the schema and cred-def ids so the portal can recover cleanly.
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
