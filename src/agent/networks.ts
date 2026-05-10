import { readFileSync } from 'fs'
import { join } from 'path'

import type { IndyVdrPoolConfig } from '@credo-ts/indy-vdr'

/**
 * Indy ledger network configuration.
 *
 * Each entry registers a pool the agent can talk to. Genesis transactions
 * are the trust root for an Indy network: they describe the validator nodes
 * the client should trust on first contact. They are public information
 * (no secrets) and rarely change.
 *
 * The genesis transactions are stored in `genesis/bcorvin-test.txn` (one
 * JSON object per line) so they can be updated without touching TypeScript
 * source. The Dockerfile copies that directory into both the builder and
 * runner stages so the file is available at runtime.
 *
 * Currently configured: BCovrin Test (the standard SSI development ledger).
 * Production target per project context: Sovrin MainNet or Cheqd (the
 * latter requires `@credo-ts/cheqd` and a different registry — see
 * `src/agent/modules.ts` for the AnonCreds registry list).
 */

// Resolved relative to the compiled output: dist/agent/networks.js → ../../genesis/
const GENESIS_PATH = join(__dirname, '..', '..', 'genesis', 'bcovrin-test.txn')
const BCOVRIN_TEST_GENESIS = readFileSync(GENESIS_PATH, 'utf-8')

const bcovrinTest: IndyVdrPoolConfig = {
  indyNamespace: 'bcovrin:test',
  isProduction: false,
  genesisTransactions: BCOVRIN_TEST_GENESIS,
  connectOnStartup: true,
}

// Credo requires a non-empty tuple here to enforce at least one network.
export const indyNetworks: [IndyVdrPoolConfig, ...IndyVdrPoolConfig[]] = [bcovrinTest]
