/**
 * @fileoverview Normalizes correlation identifiers and attaches one to each incoming request.
 * @module api/middleware/requestContext
 */

import { randomUUID } from 'node:crypto'

import type { RequestHandler } from 'express'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

/** Returns a safe caller-supplied request ID or creates a new correlation ID. */
export function normalizeRequestId(value: string | undefined) {
  return value && REQUEST_ID_PATTERN.test(value) ? value : randomUUID()
}

/** Attaches the request ID used by logs, downstream calls, and response headers. */
export const requestContext: RequestHandler = (req, res, next) => {
  const requestId = normalizeRequestId(req.header('x-request-id'))
  res.locals.requestId = requestId
  res.setHeader('X-Request-ID', requestId)
  next()
}
