import { randomBytes } from 'crypto'

import { Hasher, KeyType, TypedArrayEncoder } from '@credo-ts/core'

import type { UniversityAgent } from '../agent'
import { AppError } from '../errors'

export class DidService {
  constructor(private readonly agent: UniversityAgent) {}

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

  async createIssuerDid(params: { alias?: string }): Promise<{ did: string }> {
    const existing = await this.getIssuerDid()
    if (existing) {
      const err = new AppError(409, 'Issuer DID already created for this agent.') as AppError & { did: string }
      err.did = existing
      throw err
    }

    // Generate the DID seed server-side so callers never handle issuer key material.
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
      // BCovrin's self-registration endpoint is only for test and demo wallets.
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

function unqualifiedDidFromVerkey(verkey: string): string {
  const verkeyBytes = TypedArrayEncoder.fromBase58(verkey)
  const hash = Hasher.hash(verkeyBytes, 'sha-256')
  return TypedArrayEncoder.toBase58(new Uint8Array(hash.buffer, hash.byteOffset, 16))
}
