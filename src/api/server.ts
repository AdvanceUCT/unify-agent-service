import express, { type Express } from 'express'

import type { UniversityAgent } from '../agent'
import { config } from '../config'

import { apiKeyAuth } from './middleware/apiKeyAuth'
import { errorHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/requestLogger'
import { buildApiRouter } from './routes'

export function createApiServer(agent: UniversityAgent): Express {
  const app = express()

  app.use(express.json())
  app.use(requestLogger)

  // Tails files are public because holders and verifiers need them for revocation checks.
  app.use('/tails', express.static(config.tails.directory))
  app.use('/api', apiKeyAuth)
  app.use('/api', buildApiRouter(agent))

  app.use(errorHandler)

  return app
}
