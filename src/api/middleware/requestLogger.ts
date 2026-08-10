/**
 * @fileoverview Emits one structured completion log per HTTP request using its correlation ID.
 * @module api/middleware/requestLogger
 */

import type { RequestHandler } from 'express'

/** Records method, path, status, duration, and correlation ID after a response finishes. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint()

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000
    const requestId = String(res.locals.requestId ?? 'unknown')
    console.log(
      `[api] [${requestId}] ${req.method} ${req.originalUrl} → ${res.statusCode} ${durationMs.toFixed(1)}ms`
    )
  })

  next()
}
