import { randomUUID } from 'node:crypto'

import type { UniversityAgent } from '../agent'
import { AppError } from '../errors'
import { dispatchWebhook } from '../events/webhookDispatcher'

import { requireCredentialRevocationMetadata } from './credentialRevocationMetadata'
import {
  CredentialLifecycleStore,
  type CredentialLifecycleRecord,
  type CredentialLifecycleStatus,
} from './credentialLifecycleStore'

type LifecycleOperation = 'reactivate' | 'revoke' | 'suspend'
type LifecycleWebhookDispatcher = typeof dispatchWebhook

export type CredentialLifecycleResult = CredentialLifecycleRecord & {
  eventId?: string
}

/**
 * Applies credential lifecycle transitions to the public revocation status list, then
 * persists the resulting state and notifies the Admin Portal.
 */
export class RevocationService {
  // Lifecycle requests are serialized because two updates to the same status list index
  // must evaluate their transitions against a stable previous state.
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly agent: UniversityAgent,
    private readonly store = new CredentialLifecycleStore(),
    private readonly webhookDispatcher: LifecycleWebhookDispatcher = dispatchWebhook,
  ) {}

  async getLifecycle(credentialExchangeId: string): Promise<CredentialLifecycleResult> {
    const existing = await this.store.findByCredentialExchangeId(credentialExchangeId)
    if (existing) return existing

    const metadata = await requireCredentialRevocationMetadata(this.agent, credentialExchangeId)
    return {
      credentialExchangeId,
      ...metadata,
      status: 'ACTIVE',
      updatedAt: new Date().toISOString(),
    }
  }

  async suspend(params: { credentialExchangeId: string; reason?: string }): Promise<CredentialLifecycleResult> {
    return this.withLock(() => this.changeLifecycle('suspend', params))
  }

  async reactivate(params: { credentialExchangeId: string; reason?: string }): Promise<CredentialLifecycleResult> {
    return this.withLock(() => this.changeLifecycle('reactivate', params))
  }

  async revoke(params: { credentialExchangeId: string; reason?: string }): Promise<CredentialLifecycleResult> {
    return this.withLock(() => this.changeLifecycle('revoke', params))
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async changeLifecycle(
    operation: LifecycleOperation,
    params: { credentialExchangeId: string; reason?: string },
  ): Promise<CredentialLifecycleResult> {
    const existing = await this.store.findByCredentialExchangeId(params.credentialExchangeId)
    const metadata = existing ?? (await requireCredentialRevocationMetadata(this.agent, params.credentialExchangeId))
    const previousStatus: CredentialLifecycleStatus = existing?.status ?? 'ACTIVE'

    const idempotent = this.idempotentResult(operation, existing)
    if (idempotent) return idempotent
    this.assertTransition(operation, previousStatus, existing)

    let statusListTimestamp = existing?.statusListTimestamp
    // Suspension already marks the index as revoked. Permanently revoking that suspended
    // credential only changes the local lifecycle state; publishing the same index is redundant.
    if (!(operation === 'revoke' && previousStatus === 'SUSPENDED')) {
      statusListTimestamp = await this.publishStatusListUpdate({
        credentialRevocationId: metadata.credentialRevocationId,
        operation,
        revocationRegistryDefinitionId: metadata.revocationRegistryDefinitionId,
      })
    }

    const timestamp = new Date().toISOString()
    const status: CredentialLifecycleStatus = operation === 'reactivate' ? 'ACTIVE' : operation === 'suspend' ? 'SUSPENDED' : 'REVOKED'
    const record: CredentialLifecycleRecord = {
      ...existing,
      credentialExchangeId: params.credentialExchangeId,
      credentialRevocationId: metadata.credentialRevocationId,
      revocationRegistryDefinitionId: metadata.revocationRegistryDefinitionId,
      status,
      statusListTimestamp,
      reason: params.reason,
      ...(operation === 'suspend' ? { suspendedAt: timestamp } : {}),
      ...(operation === 'reactivate' ? { reactivatedAt: timestamp } : {}),
      ...(operation === 'revoke' ? { revokedAt: timestamp } : {}),
      updatedAt: timestamp,
    }

    // The ledger update succeeds before local persistence, and local persistence succeeds
    // before the webhook, so the portal is never told about an uncommitted lifecycle state.
    await this.store.save(record)
    const eventId = randomUUID()
    await this.webhookDispatcher({
      credentialExchangeId: record.credentialExchangeId,
      credentialRevocationId: record.credentialRevocationId,
      eventId,
      previousStatus,
      reason: record.reason,
      revocationRegistryDefinitionId: record.revocationRegistryDefinitionId,
      status,
      statusListTimestamp,
      timestamp,
      type: 'credential.lifecycleChanged',
    })

    return { ...record, eventId }
  }

  private idempotentResult(
    operation: LifecycleOperation,
    existing: CredentialLifecycleRecord | undefined,
  ): CredentialLifecycleRecord | undefined {
    if (!existing) return undefined
    if (operation === 'suspend' && existing.status === 'SUSPENDED') return existing
    if (operation === 'revoke' && existing.status === 'REVOKED') return existing
    if (operation === 'reactivate' && existing.status === 'ACTIVE' && existing.reactivatedAt) return existing
    return undefined
  }

  private assertTransition(
    operation: LifecycleOperation,
    status: CredentialLifecycleStatus,
    existing: CredentialLifecycleRecord | undefined,
  ): void {
    if (status === 'REVOKED') {
      throw new AppError(409, 'A permanently revoked credential cannot change lifecycle state.', undefined, 'CREDENTIAL_REVOKED')
    }
    if (operation === 'reactivate' && (!existing || status !== 'SUSPENDED')) {
      throw new AppError(409, 'Only a suspended credential can be reactivated.', undefined, 'CREDENTIAL_NOT_SUSPENDED')
    }
  }

  private async publishStatusListUpdate(params: {
    credentialRevocationId: string
    operation: LifecycleOperation
    revocationRegistryDefinitionId: string
  }): Promise<number> {
    const credentialIndex = Number(params.credentialRevocationId)
    if (!Number.isSafeInteger(credentialIndex) || credentialIndex < 0) {
      throw new AppError(422, 'Credential revocation id is not a valid status-list index.', undefined, 'INVALID_REVOCATION_ID')
    }

    const definitionResult = await this.agent.modules.anoncreds.getRevocationRegistryDefinition(
      params.revocationRegistryDefinitionId,
    )
    const issuerId = definitionResult.revocationRegistryDefinition?.issuerId
    if (!issuerId) {
      throw new AppError(422, 'Revocation registry definition could not be resolved.', undefined, 'REVOCATION_REGISTRY_NOT_FOUND')
    }

    const result = await this.agent.modules.anoncreds.updateRevocationStatusList({
      revocationStatusList: {
        revocationRegistryDefinitionId: params.revocationRegistryDefinitionId,
        ...(params.operation === 'reactivate'
          ? { issuedCredentialIndexes: [credentialIndex] }
          : { revokedCredentialIndexes: [credentialIndex] }),
      },
      options: {
        endorserDid: issuerId,
        endorserMode: 'internal',
      },
    })

    const state = result.revocationStatusListState
    if (state.state !== 'finished') {
      const reason = state.state === 'failed' ? state.reason : `Unexpected registration state: ${state.state}`
      throw new AppError(422, `Revocation status list update failed: ${reason}`, undefined, 'REVOCATION_UPDATE_FAILED')
    }

    const timestamp = state.revocationStatusList?.timestamp
    if (typeof timestamp !== 'number') {
      throw new AppError(422, 'Revocation status list update finished without a timestamp.', undefined, 'REVOCATION_TIMESTAMP_MISSING')
    }
    return timestamp
  }
}
