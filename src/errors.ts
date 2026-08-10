/**
 * @fileoverview Defines operational errors that may be returned safely through the HTTP layer.
 * @module errors
 */

/** An expected service failure with an HTTP status and optional safe details. */
export class AppError extends Error {
  readonly status: number
  readonly details?: unknown
  readonly code?: string

  constructor(status: number, message: string, details?: unknown, code?: string) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.details = details
    this.code = code
  }
}
