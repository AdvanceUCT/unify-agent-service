import type { RequestHandler } from 'express'

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint()

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000
    console.log(
      `[api] ${req.method} ${req.originalUrl} → ${res.statusCode} ${durationMs.toFixed(1)}ms`
    )
  })

  next()
}
