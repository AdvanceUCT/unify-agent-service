import { Router } from 'express'

import type { UniversityAgent } from '../../agent'

import { buildConnectionsRouter } from './connections'
import { buildCredentialsRouter } from './credentials'
import { buildDidsRouter } from './dids'
import { buildHealthRouter } from './health'
import { buildIssuanceRouter } from './issuance'
import { buildSchemasRouter } from './schemas'
import { buildStatusRouter } from './status'
import { buildWalletActivationRouter } from './walletActivation'

export function buildApiRouter(agent: UniversityAgent): Router {
  const router = Router()

  // Keep route mounting in one place so auth and logging wrap the same API tree.
  router.use('/health', buildHealthRouter(agent))
  router.use('/status', buildStatusRouter(agent))
  router.use('/dids', buildDidsRouter(agent))
  router.use('/issuance', buildIssuanceRouter(agent))
  router.use('/', buildSchemasRouter(agent))
  router.use('/connections', buildConnectionsRouter(agent))
  router.use('/credentials', buildCredentialsRouter(agent))
  router.use('/wallet/activation', buildWalletActivationRouter(agent))

  return router
}
