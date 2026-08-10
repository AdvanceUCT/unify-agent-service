/**
 * @fileoverview Allocates revocation registry indexes without reusing an index across credentials.
 * @module services/revocationIndexStore
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { config } from '../config'
import { AppError } from '../errors'

type RevocationIndexStoreFile = {
  nextIndexByRegistry: Record<string, number>
}

/** Reserves monotonically increasing indexes for each revocation registry. */
export class RevocationIndexStore {
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath = config.revocationIndexes.storeFile) {}

  async reserve(revocationRegistryDefinitionId: string, maximumCredentialNumber: number): Promise<number> {
    return this.withLock(async () => {
      const state = await this.readState()
      const nextIndex = state.nextIndexByRegistry[revocationRegistryDefinitionId] ?? 1

      // Credo treats maxCredNum as an exclusive upper bound for the registry index.
      if (nextIndex >= maximumCredentialNumber) {
        throw new AppError(
          409,
          'Revocation registry has no unused credential indexes. Register a new revocation registry before issuing more credentials.',
          undefined,
          'REVOCATION_REGISTRY_FULL',
        )
      }

      state.nextIndexByRegistry[revocationRegistryDefinitionId] = nextIndex + 1
      await this.writeState(state)
      return nextIndex
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

  private async readState(): Promise<RevocationIndexStoreFile> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { nextIndexByRegistry: {} }
      throw error
    }

    try {
      const parsed = JSON.parse(raw) as Partial<RevocationIndexStoreFile>
      if (!parsed.nextIndexByRegistry || typeof parsed.nextIndexByRegistry !== 'object') {
        throw new Error('Expected nextIndexByRegistry object.')
      }
      return { nextIndexByRegistry: parsed.nextIndexByRegistry }
    } catch (error) {
      throw new AppError(
        500,
        `Revocation index store is corrupt: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'REVOCATION_INDEX_STORE_CORRUPT',
      )
    }
  }

  private async writeState(state: RevocationIndexStoreFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tempPath, JSON.stringify(state, null, 2))
    await rename(tempPath, this.filePath)
  }
}
