import type { UniversityAgent } from '../agent'

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

  /**
   * Anchor a credential schema on the Indy ledger.
   *
   * TODO(team): call `agent.modules.anoncreds.registerSchema({
   *   schema: { issuerId, name, version, attrNames }, options: { endorserMode } })`
   * and return the resulting schemaId.
   */
  async registerSchema(_params: {
    issuerDid: string
    name: string
    version: string
    attributes: string[]
  }): Promise<{ schemaId: string }> {
    throw new Error('Not implemented: SchemaService.registerSchema')
  }

  /**
   * Anchor a credential definition tied to a schema on the Indy ledger.
   *
   * TODO(team): call `agent.modules.anoncreds.registerCredentialDefinition(...)`.
   * Set `supportRevocation: true` if revocation registry will be created.
   */
  async registerCredentialDefinition(_params: {
    issuerDid: string
    schemaId: string
    tag: string
    supportRevocation: boolean
  }): Promise<{ credentialDefinitionId: string }> {
    throw new Error('Not implemented: SchemaService.registerCredentialDefinition')
  }

  /**
   * Optional companion to a revocation-enabled credential definition.
   *
   * TODO(team): call `agent.modules.anoncreds.registerRevocationRegistryDefinition(...)`
   * and the matching status-list registration.
   */
  async registerRevocationRegistry(_params: {
    issuerDid: string
    credentialDefinitionId: string
    tag: string
    maximumCredentialNumber: number
  }): Promise<{ revocationRegistryDefinitionId: string }> {
    throw new Error('Not implemented: SchemaService.registerRevocationRegistry')
  }
}
