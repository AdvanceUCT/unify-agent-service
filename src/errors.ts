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
