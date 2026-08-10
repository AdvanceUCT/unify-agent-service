/**
 * @fileoverview Extracts and validates the revocation identifiers attached to Credo credentials.
 * @module services/credentialRevocationMetadata
 */

import {
  AnonCredsCredentialMetadataKey,
  AnonCredsCredentialRepository,
} from '@credo-ts/anoncreds'
import type { CredentialExchangeRecord } from '@credo-ts/core'

import type { UniversityAgent } from '../agent'
import { AppError } from '../errors'

export type CredentialRevocationMetadata = {
  credentialRevocationId: string
  revocationRegistryDefinitionId: string
}

/** Returns revocation metadata when the credential record carries a complete binding. */
export async function findCredentialRevocationMetadata(
  agent: UniversityAgent,
  credentialRecord: CredentialExchangeRecord,
): Promise<CredentialRevocationMetadata | undefined> {
  const exchangeMetadata = credentialRecord.metadata.get(AnonCredsCredentialMetadataKey)
  if (exchangeMetadata?.credentialRevocationId && exchangeMetadata.revocationRegistryId) {
    return {
      credentialRevocationId: exchangeMetadata.credentialRevocationId,
      revocationRegistryDefinitionId: exchangeMetadata.revocationRegistryId,
    }
  }

  const binding = credentialRecord.credentials.find(
    (credential) => credential.credentialRecordType === 'AnonCredsCredentialRecord',
  )

  if (!binding) return undefined

  const repository = agent.dependencyManager.resolve(AnonCredsCredentialRepository)
  const anonCredsRecord = await repository.findById(agent.context, binding.credentialRecordId)
  const credentialRevocationId = anonCredsRecord?.credentialRevocationId
  const revocationRegistryDefinitionId = anonCredsRecord?.credential.rev_reg_id

  if (!credentialRevocationId || !revocationRegistryDefinitionId) return undefined
  return { credentialRevocationId, revocationRegistryDefinitionId }
}

/** Returns complete revocation metadata or fails when the credential cannot be managed safely. */
export async function requireCredentialRevocationMetadata(
  agent: UniversityAgent,
  credentialExchangeId: string,
): Promise<CredentialRevocationMetadata> {
  let credentialRecord: CredentialExchangeRecord

  try {
    credentialRecord = await agent.credentials.getById(credentialExchangeId)
  } catch {
    throw new AppError(404, 'Credential exchange was not found.', undefined, 'CREDENTIAL_NOT_FOUND')
  }

  const metadata = await findCredentialRevocationMetadata(agent, credentialRecord)
  if (!metadata) {
    throw new AppError(
      409,
      'Credential does not contain revocation metadata and must be reissued under a revocation-enabled credential definition.',
      undefined,
      'CREDENTIAL_NOT_REVOCABLE',
    )
  }

  return metadata
}
