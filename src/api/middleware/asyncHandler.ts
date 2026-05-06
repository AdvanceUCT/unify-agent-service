import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * Wrap an async route handler so any rejected promise / thrown error is
 * forwarded to Express's error pipeline (and ultimately to `errorHandler`).
 *
 * Without this, a thrown error inside an `async` handler crashes the request
 * with an unhandled rejection rather than a proper 5xx response.
 *
 * Usage:
 *   router.get('/foo', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler<Req extends Request = Request, Res extends Response = Response>(
  handler: (req: Req, res: Res, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req as Req, res as Res, next).catch(next)
  }
}
