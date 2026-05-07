import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'

import { config } from '../../config'

function isPublicPath(path: string): boolean {
  return path === '/health' || path.startsWith('/health/')
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export const apiKeyAuth: RequestHandler = (req, res, next) => {
  // `/api/health` stays public so Docker, deploy checks, and human operators
  // can tell whether the process is alive without knowing the Admin Portal
  // shared secret. Every other `/api/*` route is protected by the bearer token.
  if (isPublicPath(req.path)) {
    next()
    return
  }

  const token = extractBearerToken(req.header('authorization'))
  if (!token || !safeEqual(token, config.api.key)) {
    // TODO(AD-75 hardening):
    // This prevents accidental unauthenticated access, but production should
    // also require HTTPS, rotate AGENT_API_KEY through deployment secrets, and
    // consider signed webhook callbacks in `src/events/` for the reverse path.
    res.status(401).json({ error: { message: 'Missing or invalid API key.' } })
    return
  }

  next()
}
