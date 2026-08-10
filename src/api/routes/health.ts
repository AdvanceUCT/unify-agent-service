/**
 * @fileoverview Reports process and agent readiness for deployment health checks.
 * @module api/routes/health
 */

import { Router } from 'express'

import type { UniversityAgent } from '../../agent'

/** Builds unauthenticated liveness and readiness endpoints for the deployment platform. */
export function buildHealthRouter(agent: UniversityAgent): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      agentLabel: agent.config.label,
      isInitialized: agent.isInitialized,
    })
  })

  return router
}
