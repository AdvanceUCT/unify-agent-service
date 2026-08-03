import { apiKeyAuth } from '../apiKeyAuth'
import { config } from '../../../config'

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }
}

function makeRequest(path: string, authorization?: string, method = 'GET') {
  return {
    path,
    method,
    header: jest.fn((name: string) => {
      if (name.toLowerCase() === 'authorization') return authorization
      return undefined
    }),
  }
}

describe('apiKeyAuth', () => {
  it('allows public health checks without a token', () => {
    const req = makeRequest('/health')
    const res = makeResponse()
    const next = jest.fn()

    apiKeyAuth(req as never, res as never, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('allows student wallet activation without the admin API token', () => {
    const req = makeRequest('/wallet/activation/resolve')
    const res = makeResponse()
    const next = jest.fn()

    apiKeyAuth(req as never, res as never, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('allows public wallet verification session creation without a token', () => {
    const req = makeRequest('/wallet/verification/sessions', undefined, 'POST')
    const res = makeResponse()
    const next = jest.fn()

    apiKeyAuth(req as never, res as never, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('allows only the exact wallet result read route without an API key', () => {
    const allowed = makeRequest('/wallet/verification/sessions/verification-001', undefined, 'GET')
    const wrongMethod = makeRequest('/wallet/verification/sessions/verification-001', undefined, 'DELETE')
    const nested = makeRequest('/wallet/verification/sessions/verification-001/details', undefined, 'GET')

    const allowedNext = jest.fn()
    apiKeyAuth(allowed as never, makeResponse() as never, allowedNext)
    expect(allowedNext).toHaveBeenCalled()

    for (const request of [wrongMethod, nested]) {
      const response = makeResponse()
      const next = jest.fn()
      apiKeyAuth(request as never, response as never, next)
      expect(next).not.toHaveBeenCalled()
      expect(response.status).toHaveBeenCalledWith(401)
    }
  })

  it('does not expose session creation on GET', () => {
    const req = makeRequest('/wallet/verification/sessions', undefined, 'GET')
    const res = makeResponse()
    const next = jest.fn()

    apiKeyAuth(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('rejects protected routes with a missing token', () => {
    const req = makeRequest('/status')
    const res = makeResponse()
    const next = jest.fn()

    apiKeyAuth(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('rejects protected routes with a wrong token', () => {
    const req = makeRequest('/status', 'Bearer wrong-token')
    const res = makeResponse()
    const next = jest.fn()

    apiKeyAuth(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('allows protected routes with the configured token', () => {
    const req = makeRequest('/status', `Bearer ${config.api.key}`)
    const res = makeResponse()
    const next = jest.fn()

    apiKeyAuth(req as never, res as never, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('allows agent-key reads on verifier routes', () => {
    const req = makeRequest('/verifier/proof-requests/request-001', `Bearer ${config.api.key}`)
    const res = makeResponse()
    const next = jest.fn()

    apiKeyAuth(req as never, res as never, next)

    expect(next).toHaveBeenCalled()
  })

  it('rejects the retired verifier key on service-point management', () => {
    const req = makeRequest('/verifier/service-points', 'Bearer dev-verifier-api-key', 'POST')
    const res = makeResponse()
    const next = jest.fn()

    apiKeyAuth(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('rejects the retired verifier key on issuer routes', () => {
    const req = makeRequest('/credentials', 'Bearer dev-verifier-api-key')
    const res = makeResponse()
    const next = jest.fn()

    apiKeyAuth(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('allows only the exact checkout claim route without an API key', () => {
    const allowed = makeRequest('/wallet/verification/sessions/verification-001/claim', undefined, 'POST')
    const nested = makeRequest('/wallet/verification/sessions/verification-001/claim/details', undefined, 'POST')

    const allowedNext = jest.fn()
    apiKeyAuth(allowed as never, makeResponse() as never, allowedNext)
    expect(allowedNext).toHaveBeenCalled()

    const response = makeResponse()
    const nestedNext = jest.fn()
    apiKeyAuth(nested as never, response as never, nestedNext)
    expect(nestedNext).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(401)
  })
})
