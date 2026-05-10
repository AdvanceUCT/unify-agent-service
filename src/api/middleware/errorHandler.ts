import { CredoError } from '@credo-ts/core'
import type { ErrorRequestHandler } from 'express'

/**
 * Centralised error → JSON response mapping.
 *
 * Conventions:
 *   - Validation errors thrown from route handlers should set `.status = 400`
 *     on the Error before throwing (or use a custom AppError class).
 *   - CredoError gets surfaced with its message but no stack (it usually
 *     describes a protocol/SSI condition the caller can act on).
 *   - Anything else falls through to a 500 with a generic message; the
 *     full stack is logged server-side.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status =
    typeof (err as { status?: unknown }).status === 'number'
      ? ((err as { status: number }).status)
      : err instanceof CredoError
      ? 422
      : 500

  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Internal Server Error'

  if (status >= 500) {
    console.error(`[api] ${req.method} ${req.originalUrl} →`, err)
  } else {
    console.warn(`[api] ${req.method} ${req.originalUrl} → ${status}: ${message}`)
  }

  res.status(status).json({
    error: {
      message,
      ...(err instanceof CredoError ? { kind: 'CredoError' } : {}),
      ...((err as { details?: unknown }).details !== undefined
        ? { details: (err as { details: unknown }).details }
        : {}),
    },
  })
}
