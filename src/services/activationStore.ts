/**
 * @fileoverview Persists hashed, expiring, single-use wallet activation capabilities.
 * @module services/activationStore
 */

import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { config } from '../config'

export type StoredActivationRecord = {
  activationId: string
  createdAt: string
  credentialExchangeId: string
  credentialRevocationId?: string
  expiresAt: string
  invitationId: string
  invitationUrl: string
  idempotencyKeyHash?: string
  issuerLabel: string
  outOfBandId?: string
  tokenHash: string
  revocationRegistryDefinitionId?: string
}

type ActivationStoreFile = {
  activations: StoredActivationRecord[]
}

/** Generates the bearer secret placed in a wallet activation link. */
export function generateActivationToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Generates the public identifier used to locate an activation record. */
export function generateActivationId(): string {
  return `activation-${randomBytes(12).toString('hex')}`
}

/** Derives the value stored server-side instead of retaining the bearer token. */
export function hashActivationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Serializes activation-record reads and writes against one JSON document. */
export class ActivationStore {
  private static readonly operationQueues = new Map<string, Promise<void>>()

  constructor(private readonly filePath = config.activations.storeFile) {}

  async save(record: StoredActivationRecord): Promise<void> {
    await this.saveMany([record])
  }

  async saveMany(records: StoredActivationRecord[]): Promise<void> {
    if (records.length === 0) return

    await this.withLock(async () => {
      const activations = await this.readAll()
      const indexByActivationId = new Map(
        activations.map((activation, index) => [activation.activationId, index] as const),
      )

      for (const record of records) {
        const existingIndex = indexByActivationId.get(record.activationId)
        if (existingIndex === undefined) {
          indexByActivationId.set(record.activationId, activations.length)
          activations.push(record)
        } else {
          activations[existingIndex] = record
        }
      }

      await this.writeAll(activations)
    })
  }

  async findByToken(token: string): Promise<StoredActivationRecord | undefined> {
    const tokenHash = hashActivationToken(token)
    const activations = await this.readAll()
    return activations.find((activation) => activation.tokenHash === tokenHash)
  }

  async findByIdempotencyKeyHash(idempotencyKeyHash: string): Promise<StoredActivationRecord | undefined> {
    return (await this.findByIdempotencyKeyHashes([idempotencyKeyHash])).get(idempotencyKeyHash)
  }

  async findByIdempotencyKeyHashes(
    idempotencyKeyHashes: readonly string[],
  ): Promise<Map<string, StoredActivationRecord>> {
    if (idempotencyKeyHashes.length === 0) return new Map()

    const requested = new Set(idempotencyKeyHashes)
    const activations = await this.readAll()
    return new Map(
      activations
        .filter(
          (activation): activation is StoredActivationRecord & { idempotencyKeyHash: string } =>
            Boolean(activation.idempotencyKeyHash && requested.has(activation.idempotencyKeyHash)),
        )
        .map((activation) => [activation.idempotencyKeyHash, activation] as const),
    )
  }

  async clear(): Promise<void> {
    await this.withLock(() => this.writeAll([]))
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = ActivationStore.operationQueues.get(this.filePath) ?? Promise.resolve()
    const result = previous.then(operation, operation)
    ActivationStore.operationQueues.set(this.filePath, result.then(() => undefined, () => undefined))
    return result
  }

  private async readAll(): Promise<StoredActivationRecord[]> {
    let raw: string

    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }

      throw error
    }

    const parsed = JSON.parse(raw) as Partial<ActivationStoreFile>
    if (!Array.isArray(parsed.activations)) {
      return []
    }

    return parsed.activations
  }

  private async writeAll(activations: StoredActivationRecord[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })

    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    const payload: ActivationStoreFile = { activations }

    await writeFile(tempPath, JSON.stringify(payload, null, 2))
    await rename(tempPath, this.filePath)
  }
}
