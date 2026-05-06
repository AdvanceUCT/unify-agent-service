import express, { type Express } from 'express'

import type { UniversityAgent } from '../agent'

import { apiKeyAuth } from './middleware/apiKeyAuth'
import { errorHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/requestLogger'
import { buildApiRouter } from './routes'

/**
 * Build the Express application that fronts the Credo agent.
 *
 * The HTTP layer is intentionally thin: it parses bodies, logs requests,
 * delegates to services (which own all Credo API knowledge), and maps
 * thrown errors to JSON responses. Adding a new endpoint should normally
 * mean writing a service method + adding one route — never reaching into
 * Credo from inside `api/`.
 */
export function createApiServer(agent: UniversityAgent): Express {
  const app = express()

  app.use(express.json())
  app.use(requestLogger)

  app.use('/api', apiKeyAuth)
  app.use('/api', buildApiRouter(agent))

  app.use(errorHandler)

  return app
}
