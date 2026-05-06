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
   * TODO(AD-69 / Joshua):
   * Implement this before Caleb's schema / credential-definition / offer
   * endpoints can be proven end to end. Those endpoints all need a real
   * issuer DID anchored on the target ledger.
   *
   * Suggested behavior:
   *   1. Ask Credo for DIDs created by this wallet, filtered to Indy DIDs.
   *   2. Return exactly one issuer DID if present.
   *   3. Return null if none exists yet.
   *   4. If more than one candidate exists, fail loudly with an AppError and
   *      tell the operator to pick/clean the wallet. Multiple issuer DIDs make
   *      schema and credential-definition ownership ambiguous.
   *
   * Persistence note:
   * Jira says "persists it to the database", but this repo currently has no
   * database layer. Credo's wallet can persist created DID records inside the
   * Askar wallet volume. If the team still wants a separate DB row for Admin
   * Portal display/audit, add that storage boundary explicitly instead of
   * hiding a file write in this service.
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
   *
   * TODO(AD-69 / Joshua) implementation checklist:
   *   - Validate and consume a 32-byte/32-character seed from the route layer.
   *   - Register/anchor the DID using the Credo 0.5 Indy DID registrar APIs
   *     already wired in `src/agent/modules.ts`.
   *   - Keep this operation idempotent. A second POST after success should not
   *     create a second issuer identity.
   *   - Store enough information for `getIssuerDid()` to return the same DID
   *     after `docker compose restart`.
   *   - Do not mark AD-69 done until this proof works:
   *       POST /api/dids/issuer -> { did }
   *       GET  /api/dids/issuer -> same { did }
   *       docker compose restart
   *       GET  /api/dids/issuer -> same { did }
   *
   * Downstream impact:
   * Until this method works, AD-70, AD-71, and AD-72 can only be considered
   * structurally implemented. They cannot prove real ledger writes or real
   * credential offers without a valid issuer DID.
   */
  async createIssuerDid(_params: { seed: string; endorserDid?: string }): Promise<{ did: string }> {
    throw new Error('Not implemented: DidService.createIssuerDid')
  }
}
