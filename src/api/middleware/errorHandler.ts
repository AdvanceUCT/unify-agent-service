import { CredoError } from '@credo-ts/core'
import type { ErrorRequestHandler } from 'express'

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Credo errors are usually protocol problems the Admin Portal can show clearly.
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
