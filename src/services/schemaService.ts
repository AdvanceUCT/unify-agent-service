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

/**
 * Credential schema and credential-definition management.
 *
 * Vocabulary:
 *   - Schema:                describes the *attributes* a credential has
 *                            (e.g. studentNumber, fullName, faculty, ...).
 *                            Schemas are public, anchored on the Indy ledger.
 *   - Credential definition: cryptographic binding of a schema to the
 *                            issuer's signing key. Verifiers fetch this to
 *                            verify signatures. Also public, also on-ledger.
 *   - Revocation registry:   created alongside a cred-def if the issuer
 *                            wants to be able to revoke later. Optional but
 *                            required for the project's revocation feature.
 *
 * Lifecycle (one-time per university deployment, run from the Admin Portal):
 *   1. Create schema(s) — the shared base + optional fields per project doc
 *   2. Create credential definition tied to the issuer DID + schema
 *   3. Create revocation registry tied to the credential definition
 *
 * Useful Credo references:
 *   - `agent.modules.anoncreds.registerSchema(...)`
 *   - `agent.modules.anoncreds.registerCredentialDefinition(...)`
 *   - `agent.modules.anoncreds.registerRevocationRegistryDefinition(...)`
 */
export class SchemaService {
  constructor(private readonly agent: UniversityAgent) {}

  private endorsementOptions(issuerDid: string) {
    return {
      endorserMode: 'internal' as const,
      endorserDid: issuerDid,
    }
  }

  /**
   * Anchor a credential schema on the Indy ledger.
   *
   * Calls the Indy VDR AnonCreds registry and returns the resulting schemaId.
   *
   * TODO(AD-70 dependency note):
   * This method is already wired to the real Credo AnonCreds registry, but it
   * cannot be proven until AD-69 returns a real issuer DID and AD-68 shows the
   * BCovrin pool as reachable. When testing, use the exact DID returned by
   * `GET /api/dids/issuer`; do not paste a random DID from another wallet.
   */
  async registerSchema(_params: {
    issuerDid: string
    name: string
    version: string
    attributes: string[]
  }): Promise<{ schemaId: string }> {
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

  /**
   * Anchor a credential definition tied to a schema on the Indy ledger.
   *
   * Set `supportRevocation: true` if a revocation registry will be created.
   *
   * TODO(AD-71 contract decision):
   * Jira says credential definition + revocation registry creation should be
   * "triggered automatically after schema creation". The repo currently
   * exposes this as separate endpoints:
   *   POST /api/schemas
   *   POST /api/credential-definitions
   *   POST /api/credential-definitions/:cdId/revocation-registries
   *
   * Before wiring the Admin Portal, decide whether to keep the explicit
   * multi-step API or add one orchestration endpoint that creates schema,
   * credential definition, and revocation registry in order. If automation is
   * required, keep these lower-level methods and add the orchestrator above
   * them so retry/error handling stays clear.
   */
  async registerCredentialDefinition(_params: {
    issuerDid: string
    schemaId: string
    tag: string
    supportRevocation: boolean
  }): Promise<{ credentialDefinitionId: string }> {
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

  /**
   * Optional companion to a revocation-enabled credential definition.
   *
   * Registers both the revocation registry definition and its initial status list.
   *
   * TODO(AD-71 test proof):
   * After AD-69 and AD-68 are complete, prove this with a revocation-enabled
   * credential definition and confirm both values are returned:
   *   - revocationRegistryDefinitionId
   *   - revocationStatusListTimestamp
   * If `supportRevocation` was false on the credential definition, this should
   * fail with a clear 4xx/422-style error rather than a vague internal error.
   */
  async registerRevocationRegistry(_params: {
    issuerDid: string
    credentialDefinitionId: string
    tag: string
    maximumCredentialNumber: number
  }): Promise<{ revocationRegistryDefinitionId: string; revocationStatusListTimestamp: number }> {
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
