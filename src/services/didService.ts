import type { UniversityAgent } from '../agent'

/**
 * Issuer DID lifecycle.
 *
 * The university issues credentials under a single Indy DID anchored on the
 * public ledger. That DID is the trust root other agents use to verify
 * credentials we sign. It must be created once during onboarding (via the
 * Admin Portal), then persisted and reused for every issuance.
 *
 * Useful Credo references:
 *   - `agent.dids.create({ method: 'indy', ... })`            create a DID
 *   - `agent.dids.resolve(did)`                               resolve a DID document
 *   - `agent.dids.getCreatedDids({ method: 'indy' })`         list DIDs we own
 *
 * See https://credo.js.org/guides/tutorials/dids for protocol-level detail.
 */
export class DidService {
  constructor(private readonly agent: UniversityAgent) {}

  /**
   * Return the issuer DID we've already created on the ledger, or null if
   * the agent hasn't been bootstrapped yet.
   *
   * TODO(team): list created DIDs filtered by method 'indy'; return the
   * first (we expect exactly one issuer DID per university deployment).
   */
  async getIssuerDid(): Promise<string | null> {
    throw new Error('Not implemented: DidService.getIssuerDid')
  }

  /**
   * Create the university's issuer DID on the BCovrin ledger.
   *
   * BCovrin Test publishes a self-serve endpoint at http://test.bcovrin.vonx.io
   * that will register a DID for you given a seed. In production (Sovrin /
   * Cheqd) this will involve a steward-signed registration ceremony instead.
   *
   * TODO(team):
   *   1. Call `agent.dids.create({ method: 'indy', options: { ... } })`
   *   2. Persist the resulting DID somewhere durable (genesis-friendly)
   *   3. Return the unqualified DID string for the Admin Portal to display
   */
  async createIssuerDid(_params: { seed: string; endorserDid?: string }): Promise<{ did: string }> {
    throw new Error('Not implemented: DidService.createIssuerDid')
  }
}
