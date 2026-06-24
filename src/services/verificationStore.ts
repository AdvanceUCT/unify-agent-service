import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { config } from '../config'
import { AppError } from '../errors'

import type { ServicePointRecord, VerificationSessionRecord } from './verificationTypes'

type VerificationStoreFile = {
  servicePoints: ServicePointRecord[]
  sessions: VerificationSessionRecord[]
}

const EMPTY_STORE: VerificationStoreFile = {
  servicePoints: [],
  sessions: [],
}

export class VerificationStore {
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath = config.verifier.storeFile) {}

  async insertServicePoint(record: ServicePointRecord): Promise<ServicePointRecord> {
    return this.withLock(async () => {
      const state = await this.readState()
      const duplicate = state.servicePoints.find(
        (item) =>
          item.id === record.id ||
          item.publicId === record.publicId ||
          (item.vendorId === record.vendorId && item.externalId === record.externalId),
      )

      if (duplicate) {
        throw new AppError(
          409,
          'A service point with this vendor and external id already exists.',
          undefined,
          'SERVICE_POINT_ALREADY_EXISTS',
        )
      }

      state.servicePoints.push(record)
      await this.writeState(state)
      return record
    })
  }

  async listServicePoints(): Promise<ServicePointRecord[]> {
    return this.withLock(async () => (await this.readState()).servicePoints)
  }

  async findServicePointById(id: string): Promise<ServicePointRecord | undefined> {
    return this.withLock(async () => (await this.readState()).servicePoints.find((item) => item.id === id))
  }

  async findServicePointByPublicId(publicId: string): Promise<ServicePointRecord | undefined> {
    return this.withLock(async () => (await this.readState()).servicePoints.find((item) => item.publicId === publicId))
  }

  async updateServicePoint(
    id: string,
    update: (record: ServicePointRecord) => ServicePointRecord,
  ): Promise<ServicePointRecord | undefined> {
    return this.withLock(async () => {
      const state = await this.readState()
      const index = state.servicePoints.findIndex((item) => item.id === id)
      if (index < 0) return undefined

      const next = update(state.servicePoints[index])
      state.servicePoints[index] = next
      await this.writeState(state)
      return next
    })
  }

  async insertSession(record: VerificationSessionRecord): Promise<VerificationSessionRecord> {
    return this.withLock(async () => {
      const state = await this.readState()
      if (state.sessions.some((item) => item.verificationRequestId === record.verificationRequestId)) {
        throw new AppError(409, 'Verification request already exists.', undefined, 'VERIFICATION_REQUEST_EXISTS')
      }

      state.sessions.push(record)
      await this.writeState(state)
      return record
    })
  }

  async findSessionById(id: string): Promise<VerificationSessionRecord | undefined> {
    return this.withLock(async () =>
      (await this.readState()).sessions.find((item) => item.verificationRequestId === id),
    )
  }

  async findSessionByProofRecordId(proofRecordId: string): Promise<VerificationSessionRecord | undefined> {
    return this.withLock(async () =>
      (await this.readState()).sessions.find((item) => item.proofRecordId === proofRecordId),
    )
  }

  async findSessionByClientRequest(
    servicePointId: string,
    clientRequestId: string,
  ): Promise<VerificationSessionRecord | undefined> {
    return this.withLock(async () =>
      (await this.readState()).sessions.find(
        (item) => item.servicePointId === servicePointId && item.clientRequestId === clientRequestId,
      ),
    )
  }

  async listSessionsByServicePoint(servicePointId: string): Promise<VerificationSessionRecord[]> {
    return this.withLock(async () =>
      (await this.readState()).sessions.filter((item) => item.servicePointId === servicePointId),
    )
  }

  async listSessions(): Promise<VerificationSessionRecord[]> {
    return this.withLock(async () => (await this.readState()).sessions)
  }

  async updateSession(
    id: string,
    update: (record: VerificationSessionRecord) => VerificationSessionRecord,
  ): Promise<VerificationSessionRecord | undefined> {
    return this.withLock(async () => {
      const state = await this.readState()
      const index = state.sessions.findIndex((item) => item.verificationRequestId === id)
      if (index < 0) return undefined

      const next = update(state.sessions[index])
      state.sessions[index] = next
      await this.writeState(state)
      return next
    })
  }

  async clear(): Promise<void> {
    await this.withLock(() => this.writeState({ ...EMPTY_STORE }))
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async readState(): Promise<VerificationStoreFile> {
    let raw: string

    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { servicePoints: [], sessions: [] }
      }
      throw error
    }

    try {
      const parsed = JSON.parse(raw) as Partial<VerificationStoreFile>
      if (!Array.isArray(parsed.servicePoints) || !Array.isArray(parsed.sessions)) {
        throw new Error('Expected servicePoints and sessions arrays.')
      }
      return {
        servicePoints: parsed.servicePoints,
        sessions: parsed.sessions,
      }
    } catch (error) {
      throw new AppError(
        500,
        `Verification store is corrupt: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'VERIFICATION_STORE_CORRUPT',
      )
    }
  }

  private async writeState(state: VerificationStoreFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tempPath, JSON.stringify(state, null, 2))
    await rename(tempPath, this.filePath)
  }
}

let defaultStore: VerificationStore | undefined

export function getVerificationStore(): VerificationStore {
  defaultStore ??= new VerificationStore()
  return defaultStore
}
