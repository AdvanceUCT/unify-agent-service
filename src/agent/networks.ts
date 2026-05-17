import { readFileSync } from 'fs'
import { join } from 'path'

import type { IndyVdrPoolConfig } from '@credo-ts/indy-vdr'

// Resolved relative to the compiled output: dist/agent/networks.js -> ../../genesis/
const GENESIS_PATH = join(__dirname, '..', '..', 'genesis', 'bcovrin-test.txn')
const BCOVRIN_TEST_GENESIS = readFileSync(GENESIS_PATH, 'utf-8')

// BCovrin Test is the dev ledger this PoC writes schemas and cred-defs to.
const bcovrinTest: IndyVdrPoolConfig = {
  indyNamespace: 'bcovrin:test',
  isProduction: false,
  genesisTransactions: BCOVRIN_TEST_GENESIS,
  connectOnStartup: true,
}

// Credo requires a non-empty tuple here to enforce at least one network.
export const indyNetworks: [IndyVdrPoolConfig, ...IndyVdrPoolConfig[]] = [bcovrinTest]
