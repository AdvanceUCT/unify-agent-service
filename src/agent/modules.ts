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

import { config } from '../config'
import { indyNetworks } from './networks'
import { LocalTailsFileService } from './tailsFileService'

export function buildAgentModules() {
  const legacyIndyCredentialFormatService = new LegacyIndyCredentialFormatService()
  const legacyIndyProofFormatService = new LegacyIndyProofFormatService()

  return {
    // Askar owns the encrypted wallet and private key material.
    askar: new AskarModule({ ariesAskar }),

    // AnonCreds needs the Indy registry so schema and cred-def ids resolve on BCovrin.
    anoncreds: new AnonCredsModule({
      anoncreds,
      registries: [new IndyVdrAnonCredsRegistry()],
      tailsFileService: new LocalTailsFileService({
        tailsDirectoryPath: config.tails.directory,
        tailsBaseUrl: config.tails.baseUrl,
      }),
    }),

    indyVdr: new IndyVdrModule({
      indyVdr,
      networks: indyNetworks,
    }),

    dids: new DidsModule({
      resolvers: [new IndyVdrIndyDidResolver()],
      registrars: [new IndyVdrIndyDidRegistrar()],
    }),

    // Auto-accept keeps the email deep-link flow moving without issuer-side clicks.
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
