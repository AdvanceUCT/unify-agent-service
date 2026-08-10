/**
 * @fileoverview Adapts async Express handlers so rejected promises reach the global error handler.
 * @module api/middleware/asyncHandler
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express'

/** Wraps a promise-returning Express handler and forwards its rejection to `next`. */
export function asyncHandler<Req extends Request = Request, Res extends Response = Response>(
  handler: (req: Req, res: Res, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req as Req, res as Res, next).catch(next)
  }
}
