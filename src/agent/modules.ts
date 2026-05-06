import {
  AutoAcceptCredential,
  AutoAcceptProof,
  ConnectionsModule,
  CredentialsModule,
  DidsModule,
  ProofsModule,
  V2CredentialProtocol,
  V2ProofProtocol,
} from '@credo-ts/core'
import {
  AnonCredsCredentialFormatService,
  AnonCredsModule,
  AnonCredsProofFormatService,
  LegacyIndyCredentialFormatService,
  LegacyIndyProofFormatService,
  V1CredentialProtocol,
  V1ProofProtocol,
} from '@credo-ts/anoncreds'
import { AskarModule } from '@credo-ts/askar'
import {
  IndyVdrAnonCredsRegistry,
  IndyVdrIndyDidRegistrar,
  IndyVdrIndyDidResolver,
  IndyVdrModule,
} from '@credo-ts/indy-vdr'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'
import { anoncreds } from '@hyperledger/anoncreds-nodejs'
import { indyVdr } from '@hyperledger/indy-vdr-nodejs'

import { indyNetworks } from './networks'

/**
 * Build the full set of Credo modules this agent needs.
 *
 * Why each module is registered (and not just left to defaults):
 *
 *  - askar:       encrypted wallet + key material storage
 *  - anoncreds:   AnonCreds credential format + proof format with the Indy
 *                 VDR registry so schemas / cred-defs resolve from BCovrin
 *  - indyVdr:     low-level Indy ledger client (ledger reads + writes)
 *  - dids:        DID resolution / registration (both for Indy DIDs)
 *  - connections: DIDComm connection protocol with autoAccept enabled so
 *                 the deep-link → wallet-handshake flow described in the
 *                 project context happens without admin intervention
 *  - credentials: V1 (legacy Indy) + V2 (AnonCreds) credential exchange
 *                 protocols, with autoAccept on content approval so the
 *                 university agent issues immediately once the wallet
 *                 accepts the offer
 *  - proofs:      V1 + V2 proof exchange (verification side, not used by
 *                 the issuer service today but cheap to keep registered)
 *
 * Returned as a const-shaped object so the resulting Agent type carries
 * the full module map (gives `agent.modules.anoncreds.registerSchema(...)`
 * and friends in IntelliSense).
 */
export function buildAgentModules() {
  const legacyIndyCredentialFormatService = new LegacyIndyCredentialFormatService()
  const legacyIndyProofFormatService = new LegacyIndyProofFormatService()

  return {
    askar: new AskarModule({ ariesAskar }),

    anoncreds: new AnonCredsModule({
      anoncreds,
      registries: [new IndyVdrAnonCredsRegistry()],
    }),

    indyVdr: new IndyVdrModule({
      indyVdr,
      networks: indyNetworks,
    }),

    dids: new DidsModule({
      resolvers: [new IndyVdrIndyDidResolver()],
      registrars: [new IndyVdrIndyDidRegistrar()],
    }),

    connections: new ConnectionsModule({
      autoAcceptConnections: true,
    }),

    credentials: new CredentialsModule({
      autoAcceptCredentials: AutoAcceptCredential.ContentApproved,
      credentialProtocols: [
        new V1CredentialProtocol({
          indyCredentialFormat: legacyIndyCredentialFormatService,
        }),
        new V2CredentialProtocol({
          credentialFormats: [legacyIndyCredentialFormatService, new AnonCredsCredentialFormatService()],
        }),
      ],
    }),

    proofs: new ProofsModule({
      autoAcceptProofs: AutoAcceptProof.ContentApproved,
      proofProtocols: [
        new V1ProofProtocol({
          indyProofFormat: legacyIndyProofFormatService,
        }),
        new V2ProofProtocol({
          proofFormats: [legacyIndyProofFormatService, new AnonCredsProofFormatService()],
        }),
      ],
    }),
  } as const
}

export type AgentModules = ReturnType<typeof buildAgentModules>
