import type { UniversityAgent } from '../agent'
import { AppError } from '../errors'

type FinishedState = { state: 'finished' }
type FailedState = { state: 'failed'; reason: string }
type ActionState = { state: 'action'; action: string }
type RegistrationState = FinishedState | FailedState | ActionState | { state: 'wait' }

function assertFinished(operation: string, state: RegistrationState): void {
  if (state.state === 'finished') return
  if (state.state === 'failed') {
    throw new AppError(422, `${operation} failed: ${state.reason}`)
  }
  if (state.state === 'action') {
    throw new AppError(422, `${operation} requires external action: ${state.action}`)
  }

  throw new AppError(422, `${operation} did not finish synchronously.`)
}

export class SchemaService {
  constructor(private readonly agent: UniversityAgent) {}

  private endorsementOptions(issuerDid: string) {
    return {
      endorserMode: 'internal' as const,
      endorserDid: issuerDid,
    }
  }

  async registerSchema(_params: {
    issuerDid: string
    name: string
    version: string
    attributes: string[]
  }): Promise<{ schemaId: string }> {
    // The schema is public ledger data: just names, not student values.
    const result = await this.agent.modules.anoncreds.registerSchema({
      schema: {
        issuerId: _params.issuerDid,
        name: _params.name,
        version: _params.version,
        attrNames: _params.attributes,
      },
      options: this.endorsementOptions(_params.issuerDid),
    })

    assertFinished('Schema registration', result.schemaState)
    const schemaId = result.schemaState.schemaId
    if (!schemaId) {
      throw new AppError(422, 'Schema registration finished without a schema id.')
    }

    return { schemaId }
  }

  async registerCredentialDefinition(_params: {
    issuerDid: string
    schemaId: string
    tag: string
    supportRevocation: boolean
  }): Promise<{ credentialDefinitionId: string }> {
    // The cred-def ties this issuer's signing key to the schema.
    const result = await this.agent.modules.anoncreds.registerCredentialDefinition({
      credentialDefinition: {
        issuerId: _params.issuerDid,
        schemaId: _params.schemaId,
        tag: _params.tag,
      },
      options: {
        ...this.endorsementOptions(_params.issuerDid),
        supportRevocation: _params.supportRevocation,
      },
    })

    assertFinished('Credential definition registration', result.credentialDefinitionState)
    const credentialDefinitionId = result.credentialDefinitionState.credentialDefinitionId
    if (!credentialDefinitionId) {
      throw new AppError(422, 'Credential definition registration finished without a credential definition id.')
    }

    return { credentialDefinitionId }
  }

  async registerRevocationRegistry(_params: {
    issuerDid: string
    credentialDefinitionId: string
    tag: string
    maximumCredentialNumber: number
  }): Promise<{ revocationRegistryDefinitionId: string; revocationStatusListTimestamp: number }> {
    // Revocation needs both a registry definition and the first status list.
    const result = await this.agent.modules.anoncreds.registerRevocationRegistryDefinition({
      revocationRegistryDefinition: {
        issuerId: _params.issuerDid,
        credentialDefinitionId: _params.credentialDefinitionId,
        tag: _params.tag,
        maximumCredentialNumber: _params.maximumCredentialNumber,
      },
      options: this.endorsementOptions(_params.issuerDid),
    })

    assertFinished('Revocation registry definition registration', result.revocationRegistryDefinitionState)

    const revocationRegistryDefinitionId = result.revocationRegistryDefinitionState.revocationRegistryDefinitionId
    if (!revocationRegistryDefinitionId) {
      throw new AppError(422, 'Revocation registry registration finished without a registry definition id.')
    }

    const statusList = await this.agent.modules.anoncreds.registerRevocationStatusList({
      revocationStatusList: {
        issuerId: _params.issuerDid,
        revocationRegistryDefinitionId,
      },
      options: this.endorsementOptions(_params.issuerDid),
    })

    assertFinished('Revocation status list registration', statusList.revocationStatusListState)
    const revocationStatusList = statusList.revocationStatusListState.revocationStatusList
    if (!revocationStatusList) {
      throw new AppError(422, 'Revocation status list registration finished without a status list.')
    }
    if (typeof revocationStatusList.timestamp !== 'number') {
      throw new AppError(422, 'Revocation status list registration finished without a timestamp.')
    }

    return {
      revocationRegistryDefinitionId,
      revocationStatusListTimestamp: revocationStatusList.timestamp,
    }
  }
}
