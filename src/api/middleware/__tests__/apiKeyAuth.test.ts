import { apiKeyAuth } from '../apiKeyAuth'
import { config } from '../../../config'

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }
}

function makeRequest(path: string, authorization?: string) {
  return {
    path,
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
})
