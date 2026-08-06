import type { NextFunction, Request, Response } from 'express'

import { normalizeRequestId, requestContext } from '../requestContext'

describe('requestContext', () => {
  it('accepts a valid caller request ID and echoes it', () => {
    const req = { header: jest.fn().mockReturnValue('portal-request:001') } as unknown as Request
    const res = {
      locals: {},
      setHeader: jest.fn(),
    } as unknown as Response
    const next = jest.fn() as NextFunction

    requestContext(req, res, next)

    expect(res.locals.requestId).toBe('portal-request:001')
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'portal-request:001')
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('replaces malformed request IDs', () => {
    expect(normalizeRequestId('contains spaces and secrets')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
