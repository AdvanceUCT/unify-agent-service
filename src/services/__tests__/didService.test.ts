import { KeyType } from '@credo-ts/core'

import { AppError } from '../../errors'
import { DidService } from '../didService'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Minimal public-key buffer that produces a deterministic verkey/DID. */
const MOCK_PUBLIC_KEY = Buffer.alloc(32, 0x01)

function makeMockAgent(overrides: {
  createdDids?: Array<{ did: string }>
  importError?: Error
  createKeyError?: Error
} = {}) {
  return {
    wallet: {
      createKey: jest.fn().mockImplementation(() => {
        if (overrides.createKeyError) return Promise.reject(overrides.createKeyError)
        return Promise.resolve({ publicKey: MOCK_PUBLIC_KEY })
      }),
    },
    dids: {
      getCreatedDids: jest.fn().mockResolvedValue(overrides.createdDids ?? []),
      import: jest.fn().mockImplementation(() => {
        if (overrides.importError) return Promise.reject(overrides.importError)
        return Promise.resolve(undefined)
      }),
    },
  }
}

// ---------------------------------------------------------------------------
// getIssuerDid()
// ---------------------------------------------------------------------------

describe('DidService.getIssuerDid()', () => {
  it('returns null when the wallet has no Indy DIDs', async () => {
    const agent = makeMockAgent({ createdDids: [] })
    const service = new DidService(agent as never)

    await expect(service.getIssuerDid()).resolves.toBeNull()
  })

  it('returns the DID string when exactly one Indy DID exists', async () => {
    const did = 'did:indy:bcovrin:test:Th7MpTaRZVRYnPiabds81Y'
    const agent = makeMockAgent({ createdDids: [{ did }] })
    const service = new DidService(agent as never)

    await expect(service.getIssuerDid()).resolves.toBe(did)
  })

  it('throws AppError(500) when more than one Indy DID is found', async () => {
    const agent = makeMockAgent({
      createdDids: [
        { did: 'did:indy:bcovrin:test:Aaaaaaaaaaaaaaaaaaaaaaa1' },
        { did: 'did:indy:bcovrin:test:Aaaaaaaaaaaaaaaaaaaaaaa2' },
      ],
    })
    const service = new DidService(agent as never)

    const err = await service.getIssuerDid().catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).status).toBe(500)
    expect((err as AppError).message).toMatch(/multiple issuer dids/i)
  })
})

// ---------------------------------------------------------------------------
// createIssuerDid()
// ---------------------------------------------------------------------------

describe('DidService.createIssuerDid()', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('calls BCovrin with the correct body shape and returns a qualified DID', async () => {
    const agent = makeMockAgent({ createdDids: [] })
    const service = new DidService(agent as never)

    const mockFetch = jest.fn().mockResolvedValue({ ok: true, text: jest.fn() } as unknown as Response)
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch)

    const result = await service.createIssuerDid({ alias: 'Test University' })

    expect(result.did).toMatch(/^did:indy:bcovrin:test:[A-HJ-NP-Za-km-z1-9]{21,22}$/)

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://test.bcovrin.vonx.io/register')

    const body = JSON.parse(init.body as string)
    expect(body.role).toBe('ENDORSER')
    expect(body.alias).toBe('Test University')
    expect(body).toHaveProperty('did')
    expect(body).toHaveProperty('verkey')
  })

  it('uses the default alias when none is provided', async () => {
    const agent = makeMockAgent({ createdDids: [] })
    const service = new DidService(agent as never)

    const mockFetch = jest.fn().mockResolvedValue({ ok: true, text: jest.fn() } as unknown as Response)
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch)

    await service.createIssuerDid({})

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.alias).toBe('university-identity-agent')
  })

  it('calls agent.dids.import with the did:indy:bcovrin:test: prefix and Ed25519 key', async () => {
    const agent = makeMockAgent({ createdDids: [] })
    const service = new DidService(agent as never)

    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, text: jest.fn() } as unknown as Response)

    const result = await service.createIssuerDid({})

    expect(agent.dids.import).toHaveBeenCalledWith(
      expect.objectContaining({
        did: result.did,
        overwrite: false,
        privateKeys: expect.arrayContaining([
          expect.objectContaining({ keyType: KeyType.Ed25519 }),
        ]),
      }),
    )
  })

  it('never includes the seed in any fetch call body or console output', async () => {
    const agent = makeMockAgent({ createdDids: [] })
    const service = new DidService(agent as never)

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, text: jest.fn() } as unknown as Response)
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch)

    await service.createIssuerDid({})

    // The fetch body should only contain role, alias, did, verkey — not the seed
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['role', 'alias', 'did', 'verkey']))
    expect(body).not.toHaveProperty('seed')

    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('throws AppError(409) with the existing DID when a DID already exists', async () => {
    const existingDid = 'did:indy:bcovrin:test:Th7MpTaRZVRYnPiabds81Y'
    const agent = makeMockAgent({ createdDids: [{ did: existingDid }] })
    const service = new DidService(agent as never)

    const err = await service.createIssuerDid({}).catch((e) => e)

    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).status).toBe(409)
    expect((err as AppError & { did: string }).did).toBe(existingDid)
  })

  it('throws AppError(502) when the BCovrin fetch rejects (network error)', async () => {
    const agent = makeMockAgent({ createdDids: [] })
    const service = new DidService(agent as never)

    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    const err = await service.createIssuerDid({}).catch((e) => e)

    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).status).toBe(502)
    expect((err as AppError).message).toMatch(/unavailable/i)
  })

  it('throws AppError(502) when BCovrin returns a non-200 response', async () => {
    const agent = makeMockAgent({ createdDids: [] })
    const service = new DidService(agent as never)

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('DID already exists on ledger'),
    } as unknown as Response)

    const err = await service.createIssuerDid({}).catch((e) => e)

    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).status).toBe(502)
    expect((err as AppError).message).toMatch(/400/)
  })
})
