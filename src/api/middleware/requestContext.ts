import { randomUUID } from 'node:crypto'

import type { RequestHandler } from 'express'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export function normalizeRequestId(value: string | undefined) {
  return value && REQUEST_ID_PATTERN.test(value) ? value : randomUUID()
}

export const requestContext: RequestHandler = (req, res, next) => {
  const requestId = normalizeRequestId(req.header('x-request-id'))
  res.locals.requestId = requestId
  res.setHeader('X-Request-ID', requestId)
  next()
}
