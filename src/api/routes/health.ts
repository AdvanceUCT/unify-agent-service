import { Router } from 'express'

import type { UniversityAgent } from '../../agent'

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
