import type { UniversityAgent } from '../agent'

/**
 * Credential revocation.
 *
 * AnonCreds supports cryptographic revocation via accumulator-based
 * revocation registries. To revoke an issued credential we publish a
 * status-list update on the Indy ledger; verifiers checking the credential
 * later will fetch the latest status list and see the revocation.
 *
 * Prerequisites:
 *   - The credential definition must have been registered with
 *     `supportRevocation: true` (see SchemaService.registerCredentialDefinition).
 *   - A revocation registry definition must exist for that cred-def
 *     (see SchemaService.registerRevocationRegistry).
 *   - The credential exchange record must have a revocation registry index
 *     assigned at issuance time (Credo handles this automatically when the
 *     cred-def supports revocation).
 *
 * Useful Credo references:
 *   - `agent.modules.anoncreds.updateRevocationStatusList(...)`
 *   - `agent.credentials.getById(id)` — has the revocationRegistryId + index
 */
export class RevocationService {
  constructor(private readonly agent: UniversityAgent) {}

  /**
   * Revoke a previously-issued credential.
   *
   * TODO(team):
   *   1. Look up the credential exchange to find its revocation index
   *   2. Call `agent.modules.anoncreds.updateRevocationStatusList({
   *        revocationRegistryDefinitionId, revokedCredentialIndexes: [...]
   *      })`
   *   3. Return the new status-list timestamp / revocation reference
   *
   * Done means:
   *   - Revoking an issued credential updates the ledger status list.
   *   - Revoking an unknown exchange returns a useful 404-style error.
   *   - Revoking a non-revocable credential returns a clear 4xx error.
   *   - A wallet/proof check after revocation observes the credential as
   *     revoked, not just "the API returned a timestamp".
   */
  async revoke(_params: { credentialExchangeId: string; reason?: string }): Promise<{ revokedAt: string }> {
    throw new Error('Not implemented: RevocationService.revoke')
  }
}
