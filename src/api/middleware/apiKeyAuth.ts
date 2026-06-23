import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'

import { config } from '../../config'

function isPublicPath(path: string): boolean {
  return (
    path === '/health' ||
    path.startsWith('/health/') ||
    path.startsWith('/wallet/activation/') ||
    path === '/wallet/verification/sessions'
  )
}

function isVerifierReadPath(path: string, method: string): boolean {
  return method === 'GET' && path.startsWith('/verifier/')
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
  // Health checks and student activation resolve cannot depend on the Admin Portal key.
  if (isPublicPath(req.path)) {
    next()
    return
  }

  const token = extractBearerToken(req.header('authorization'))
  const hasAgentAccess = token ? safeEqual(token, config.api.key) : false
  const hasVerifierReadAccess = token
    ? safeEqual(token, config.verifier.apiKey) && isVerifierReadPath(req.path, req.method)
    : false

  if (!hasAgentAccess && !hasVerifierReadAccess) {
    // Keep the response vague so callers cannot tell which part was wrong.
    res.status(401).json({ error: { message: 'Missing or invalid API key.' } })
    return
  }

  next()
}
