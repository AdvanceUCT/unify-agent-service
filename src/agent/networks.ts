import type { IndyVdrPoolConfig } from '@credo-ts/indy-vdr'

/**
 * Indy ledger network configuration.
 *
 * Each entry registers a pool the agent can talk to. Genesis transactions
 * are the trust root for an Indy network: they describe the validator nodes
 * the client should trust on first contact. They are public information
 * (no secrets) and rarely change.
 *
 * Currently configured: BCovrin Test (the standard SSI development ledger).
 * Production target per project context: Sovrin MainNet or Cheqd (the
 * latter requires `@credo-ts/cheqd` and a different registry — see
 * `src/agent/modules.ts` for the AnonCreds registry list).
 */

const BCOVRIN_TEST_GENESIS = `{"reqSignature":{},"txn":{"data":{"data":{"alias":"Node1","blskey":"4N8aUNHSgjQVgkpm8nhNEfDf6txHznoYREg9kirmJrkivgL4oSEimFF6nsQ6M41QvhM2Z33nves5vfSn9n1UwNFJBYtWVnHYMATn76vLuL3zU88KyeAYcHfsih3He6UHcXDx","blskey_pop":"RahHYiCvoNCtPTrVtP7nMC5eTYrsUA8WjXbdhNc8debh1agE9bGiJFh8eLkeMmqq8F7VAmjQkLSdAmd4FDzkC34x6pgGFhGhRXCCCMkCuTHans5hXNBJKyJqGf9fYHJcpEpF6H7Mz9gFAjGKiCKJVghDsHSGj44NVBGFAFzZnJmO","client_ip":"3.217.107.54","client_port":9702,"node_ip":"3.217.107.54","node_port":9701,"services":["VALIDATOR"]},"dest":"Gw6pDLhcBcoQesN72qfotTgFa7cbuqZpkX3Xo6pLhPhv"},"metadata":{"from":"Th7MpTaRZVRYnPiabds81Y"},"type":"0"},"txnMetadata":{"seqNo":1,"txnId":"fea82e10e894419fe2bea7d96296a6d46f50f93f9eeda954ec461b2ed2950b62"},"ver":"1"}`

const bcovrinTest: IndyVdrPoolConfig = {
  indyNamespace: 'bcovrin:test',
  isProduction: false,
  genesisTransactions: BCOVRIN_TEST_GENESIS,
  connectOnStartup: true,
}

// Credo requires a non-empty tuple here to enforce at least one network.
export const indyNetworks: [IndyVdrPoolConfig, ...IndyVdrPoolConfig[]] = [bcovrinTest]
