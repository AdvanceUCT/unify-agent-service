/**
 * @fileoverview Stores the agent's materialized suspension and revocation lifecycle records.
 * @module services/credentialLifecycleStore
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { config } from '../config'
import { AppError } from '../errors'

export type CredentialLifecycleStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED'

export type CredentialLifecycleRecord = {
  credentialExchangeId: string
  credentialRevocationId: string
  revocationRegistryDefinitionId: string
  status: CredentialLifecycleStatus
  statusListTimestamp?: number
  reason?: string
  suspendedAt?: string
  reactivatedAt?: string
  revokedAt?: string
  updatedAt: string
}

type CredentialLifecycleStoreFile = {
  credentials: CredentialLifecycleRecord[]
}

/** Maintains replay-safe local lifecycle state keyed by credential exchange. */
export class CredentialLifecycleStore {
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath = config.credentialLifecycle.storeFile) {}

  async findByCredentialExchangeId(credentialExchangeId: string): Promise<CredentialLifecycleRecord | undefined> {
    return this.withLock(async () =>
      (await this.readAll()).find((record) => record.credentialExchangeId === credentialExchangeId),
    )
  }

  async save(record: CredentialLifecycleRecord): Promise<CredentialLifecycleRecord> {
    return this.withLock(async () => {
      const credentials = await this.readAll()
      const index = credentials.findIndex((item) => item.credentialExchangeId === record.credentialExchangeId)

      if (index >= 0) credentials[index] = record
      else credentials.push(record)

      await this.writeAll(credentials)
      return record
    })
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async readAll(): Promise<CredentialLifecycleRecord[]> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }

    try {
      const parsed = JSON.parse(raw) as Partial<CredentialLifecycleStoreFile>
      if (!Array.isArray(parsed.credentials)) throw new Error('Expected a credentials array.')
      return parsed.credentials
    } catch (error) {
      throw new AppError(
        500,
        `Credential lifecycle store is corrupt: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'CREDENTIAL_LIFECYCLE_STORE_CORRUPT',
      )
    }
  }

  private async writeAll(credentials: CredentialLifecycleRecord[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tempPath, JSON.stringify({ credentials }, null, 2))
    await rename(tempPath, this.filePath)
  }
}
