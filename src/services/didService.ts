import { randomBytes } from 'crypto'

import { Hasher, KeyType, TypedArrayEncoder } from '@credo-ts/core'

import type { UniversityAgent } from '../agent'
import { AppError } from '../errors'

/**
 * Issuer DID lifecycle.
 *
 * The university issues credentials under a single Indy DID anchored on the
 * public ledger. That DID is the trust root other agents use to verify
 * credentials we sign. It must be created once during onboarding (via the
 * Admin Portal), then persisted and reused for every issuance.
 *
 * Persistence: the DID record and its private key are stored inside the
 * Credo/Askar encrypted wallet volume (agent-data). No separate database
 * layer is needed for the PoC.
 *
 * See docs-local/implementation-guide-ad68-ad69.md for full implementation
 * context, error handling decisions, and the done definition.
 */
export class DidService {
  constructor(private readonly agent: UniversityAgent) {}

  /**
   * Return the issuer DID owned by this wallet, or null if the agent has not
   * been bootstrapped yet.
   *
   * Throws 500 if the wallet somehow contains more than one Indy DID — that
   * should never happen and indicates wallet corruption or a bug.
   */
  async getIssuerDid(): Promise<string | null> {
    const dids = await this.agent.dids.getCreatedDids({ method: 'indy' })

    if (dids.length > 1) {
      throw new AppError(
        500,
        'Multiple issuer DIDs found in wallet. This should never happen — inspect the wallet and remove duplicates before continuing.',
      )
    }

    return dids[0]?.did ?? null
  }

  /**
   * Create the university's issuer DID on BCovrin Test and import it into the
   * Credo wallet so this agent can sign as that DID.
   *
   * This is a one-time onboarding operation. Calling it again when a DID
   * already exists returns a 409 with the existing DID — it never creates a
   * second issuer identity.
   *
   * The seed is generated server-side and never logged, returned, or included
   * in any error body. The Admin Portal receives only the resulting DID.
   */
  async createIssuerDid(params: { alias?: string }): Promise<{ did: string }> {
    const existing = await this.getIssuerDid()
    if (existing) {
      const err = new AppError(409, 'Issuer DID already created for this agent.') as AppError & { did: string }
      err.did = existing
      throw err
    }

    // Generate 32 hex chars of entropy. Treated as the raw private key seed
    // for the Ed25519 key pair. Never logged or returned.
    const seed = randomBytes(16).toString('hex')

    const key = await this.agent.wallet.createKey({
      keyType: KeyType.Ed25519,
      privateKey: TypedArrayEncoder.fromString(seed),
    })

    const verkey = TypedArrayEncoder.toBase58(key.publicKey)
    const unqualifiedDid = unqualifiedDidFromVerkey(verkey)
    const alias = params.alias ?? 'university-identity-agent'

    let bcovrinRes: Response
    try {
      bcovrinRes = await fetch('http://test.bcovrin.vonx.io/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ENDORSER', alias, did: unqualifiedDid, verkey }),
      })
    } catch {
      throw new AppError(502, 'Ledger registration service unavailable — BCovrin endpoint unreachable.')
    }

    if (!bcovrinRes.ok) {
      const detail = await bcovrinRes.text().catch(() => '<no body>')
      throw new AppError(502, `BCovrin registration failed (${bcovrinRes.status}): ${detail}`)
    }

    const qualifiedDid = `did:indy:bcovrin:test:${unqualifiedDid}`

    await this.agent.dids.import({
      did: qualifiedDid,
      overwrite: false,
      privateKeys: [
        {
          keyType: KeyType.Ed25519,
          privateKey: TypedArrayEncoder.fromString(seed),
        },
      ],
    })

    return { did: qualifiedDid }
  }
}

/**
 * Derive the Indy unqualified DID from a base58-encoded verkey.
 * Algorithm: base58( SHA-256(verkeyBytes)[0..15] )
 */
function unqualifiedDidFromVerkey(verkey: string): string {
  const verkeyBytes = TypedArrayEncoder.fromBase58(verkey)
  const hash = Hasher.hash(verkeyBytes, 'sha-256')
  return TypedArrayEncoder.toBase58(new Uint8Array(hash.buffer, hash.byteOffset, 16))
}
