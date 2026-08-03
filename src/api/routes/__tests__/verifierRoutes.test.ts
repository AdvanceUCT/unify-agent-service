import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

import express, { type Router } from 'express'

import { errorHandler } from '../../middleware/errorHandler'
import { buildVerifierRouter } from '../verifier'
import { buildWalletVerificationRouter } from '../walletVerification'

async function withServer(router: Router, action: (baseUrl: string) => Promise<void>) {
  const app = express()
  app.use(express.json())
  app.use(router)
  app.use(errorHandler)
  const server = app.listen(0)
  await once(server, 'listening')
  const port = (server.address() as AddressInfo).port

  try {
    await action(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

function verifierServiceMock() {
  return {
    createServicePoint: jest.fn().mockResolvedValue({ id: 'service-point-001' }),
    createCheckoutSession: jest.fn().mockResolvedValue({ verificationRequestId: 'verification-001' }),
    listServicePoints: jest.fn().mockResolvedValue([]),
    listSessions: jest.fn().mockResolvedValue([]),
    getServicePoint: jest.fn().mockResolvedValue({ id: 'service-point-001' }),
    updateServicePoint: jest.fn().mockResolvedValue({ id: 'service-point-001' }),
    getResult: jest.fn().mockResolvedValue({ verificationRequestId: 'verification-001', status: 'Pending' }),
    listTrustedCredentialDefinitions: jest.fn().mockResolvedValue([]),
    registerTrustedCredentialDefinition: jest.fn().mockResolvedValue({ credentialDefinitionId: 'cred-def-001' }),
  }
}

describe('verifier routes', () => {
  it('validates and forwards service-point registration', async () => {
    const service = verifierServiceMock()
    const router = buildVerifierRouter({} as never, service as never)

    await withServer(router, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/service-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: 'vendor-001',
          vendorName: 'Library Cafe',
          externalId: 'main-counter',
          name: 'Main Counter',
        }),
      })

      expect(response.status).toBe(201)
      expect(service.createServicePoint).toHaveBeenCalledWith({
        vendorId: 'vendor-001',
        vendorName: 'Library Cafe',
        externalId: 'main-counter',
        name: 'Main Counter',
      })
    })
  })

  it('returns a 400 before the service layer when registration fields are missing', async () => {
    const service = verifierServiceMock()
    const router = buildVerifierRouter({} as never, service as never)

    await withServer(router, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/service-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: 'vendor-001' }),
      })

      expect(response.status).toBe(400)
      expect(service.createServicePoint).not.toHaveBeenCalled()
    })
  })

  it('rejects empty service-point updates with a diagnostic code', async () => {
    const service = verifierServiceMock()
    const router = buildVerifierRouter({} as never, service as never)

    await withServer(router, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/service-points/service-point-001`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = (await response.json()) as { error: { code?: string } }

      expect(response.status).toBe(400)
      expect(body.error.code).toBe('EMPTY_UPDATE')
      expect(service.updateServicePoint).not.toHaveBeenCalled()
    })
  })

  it('routes proof status lookups independently from service-point routes', async () => {
    const service = verifierServiceMock()
    const router = buildVerifierRouter({} as never, service as never)

    await withServer(router, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/proof-requests/verification-001`)
      expect(response.status).toBe(200)
      expect(service.getResult).toHaveBeenCalledWith('verification-001')
    })
  })

  it('creates a checkout-bound session from validated identifiers', async () => {
    const service = verifierServiceMock()
    const router = buildVerifierRouter({} as never, service as never)

    await withServer(router, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/checkout-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: 'vendor-001',
          servicePointId: 'service-point-001',
          checkoutId: 'cart-001',
        }),
      })

      expect(response.status).toBe(201)
      expect(service.createCheckoutSession).toHaveBeenCalledWith({
        vendorId: 'vendor-001',
        servicePointId: 'service-point-001',
        checkoutId: 'cart-001',
      })
    })
  })

  it('registers a trusted credential definition as the default schema policy', async () => {
    const service = verifierServiceMock()
    const router = buildVerifierRouter({} as never, service as never)

    await withServer(router, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/credential-definitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialDefinitionId: 'cred-def-002', makeDefault: true }),
      })

      expect(response.status).toBe(201)
      expect(service.registerTrustedCredentialDefinition).toHaveBeenCalledWith({
        credentialDefinitionId: 'cred-def-002',
        makeDefault: true,
      })
    })
  })
})

describe('wallet verification routes', () => {
  it('starts a session with validated wallet identifiers', async () => {
    const service = {
      startSession: jest.fn().mockResolvedValue({ verificationRequestId: 'verification-001' }),
      claimCheckoutSession: jest.fn(),
      getWalletResult: jest.fn(),
    }
    const router = buildWalletVerificationRouter({} as never, service)

    await withServer(router, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicServicePointId: 'sp-public-001', clientRequestId: 'client-001' }),
      })

      expect(response.status).toBe(201)
      expect(service.startSession).toHaveBeenCalledWith(
        expect.objectContaining({
          publicServicePointId: 'sp-public-001',
          clientRequestId: 'client-001',
          requestIp: expect.any(String),
        }),
      )
    })
  })

  it('rejects malformed wallet requests before creating a proof', async () => {
    const service = { startSession: jest.fn(), claimCheckoutSession: jest.fn(), getWalletResult: jest.fn() }
    const router = buildWalletVerificationRouter({} as never, service as never)

    await withServer(router, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicServicePointId: 'sp-public-001' }),
      })

      expect(response.status).toBe(400)
      expect(service.startSession).not.toHaveBeenCalled()
    })
  })

  it('forwards the result capability without exposing verifier credentials', async () => {
    const service = {
      startSession: jest.fn(),
      claimCheckoutSession: jest.fn(),
      getWalletResult: jest.fn().mockResolvedValue({ status: 'Pending', expiresAt: '2026-06-23T10:05:00.000Z' }),
    }
    const router = buildWalletVerificationRouter({} as never, service)

    await withServer(router, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions/verification-001`, {
        headers: { Authorization: 'Bearer wallet-result-token' },
      })

      expect(response.status).toBe(200)
      expect(service.getWalletResult).toHaveBeenCalledWith('verification-001', 'wallet-result-token')
      await expect(response.json()).resolves.toEqual({
        status: 'Pending',
        expiresAt: '2026-06-23T10:05:00.000Z',
      })
    })
  })

  it('forwards a single-use checkout claim to the verification service', async () => {
    const service = {
      startSession: jest.fn(),
      claimCheckoutSession: jest.fn().mockResolvedValue({ verificationRequestId: 'verification-001' }),
      getWalletResult: jest.fn(),
    }
    const router = buildWalletVerificationRouter({} as never, service)

    await withServer(router, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/sessions/verification-001/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimToken: 'single-use-token' }),
      })

      expect(response.status).toBe(200)
      expect(service.claimCheckoutSession).toHaveBeenCalledWith({
        verificationRequestId: 'verification-001',
        claimToken: 'single-use-token',
      })
    })
  })
})
