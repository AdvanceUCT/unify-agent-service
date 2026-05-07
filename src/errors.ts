/**
 * Error type for expected API failures.
 *
 * Use this when the caller can act on the response: bad input, missing setup,
 * conflict, ledger operation failed, partial issuance setup, and similar
 * domain errors. Unexpected bugs should keep throwing normal Error instances
 * so `errorHandler` logs them as 500s.
 */
export class AppError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.details = details
  }
}
