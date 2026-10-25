/**
 * @fileoverview Persists service points, trusted definitions, vendor suspensions, and verification sessions in the
 * agent data volume with serialized, atomic updates.
 * @module services/verificationStore
 */

import { timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { config } from '../config'
import { AppError } from '../errors'

import type {
  ServicePointRecord,
  TrustedCredentialDefinitionRecord,
  VendorSuspensionRecord,
  VerificationSessionRecord,
} from './verificationTypes'

type VerificationStoreFile = {
  servicePoints: ServicePointRecord[]
  sessions: VerificationSessionRecord[]
  trustedCredentialDefinitions: TrustedCredentialDefinitionRecord[]
  vendorSuspensions: VendorSuspensionRecord[]
}

const EMPTY_STORE: VerificationStoreFile = {
  servicePoints: [],
  sessions: [],
  trustedCredentialDefinitions: [],
  vendorSuspensions: [],
}

/**
 * Small file-backed persistence for the verifier PoC. The configured file lives in the
 * agent data volume, alongside the encrypted Credo wallet, rather than in PostgreSQL.
 */
export class VerificationStore {
  // Every read-modify-write operation shares one queue so concurrent requests cannot
  // overwrite each other's service points, policies, or session transitions.
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath = config.verifier.storeFile) {}

  /**
   * Check public IDs and vendor/external references for duplicates before saving.
   * The shared file queue keeps that check and write together within this process.
   */
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

  async listTrustedCredentialDefinitions(): Promise<TrustedCredentialDefinitionRecord[]> {
    return this.withLock(async () => (await this.readState()).trustedCredentialDefinitions)
  }

  async findTrustedCredentialDefinition(
    credentialDefinitionId: string,
  ): Promise<TrustedCredentialDefinitionRecord | undefined> {
    return this.withLock(async () =>
      (await this.readState()).trustedCredentialDefinitions.find(
        (record) => record.credentialDefinitionId === credentialDefinitionId,
      ),
    )
  }

  /**
   * Save the trusted definition and optionally make it the default.
   * Changing the default also moves service points whose saved definition matches the old default.
   */
  async upsertTrustedCredentialDefinition(
    record: TrustedCredentialDefinitionRecord,
    makeDefault: boolean,
  ): Promise<TrustedCredentialDefinitionRecord> {
    return this.withLock(async () => {
      const state = await this.readState()
      const previousDefaultCredentialDefinitionId = makeDefault
        ? state.trustedCredentialDefinitions.find((item) => item.isDefault)?.credentialDefinitionId
        : undefined
      if (makeDefault) {
        state.trustedCredentialDefinitions = state.trustedCredentialDefinitions.map((item) => ({
          ...item,
          isDefault: false,
        }))
      }

      const index = state.trustedCredentialDefinitions.findIndex(
        (item) => item.credentialDefinitionId === record.credentialDefinitionId,
      )
      const next = {
        ...record,
        isDefault:
          makeDefault || record.isDefault || (index >= 0 && state.trustedCredentialDefinitions[index].isDefault),
      }
      if (index >= 0) state.trustedCredentialDefinitions[index] = next
      else state.trustedCredentialDefinitions.push(next)

      // Move service points whose saved definition matches the previous default.
      // There is no separate flag here recording how that definition was selected.
      if (
        makeDefault &&
        previousDefaultCredentialDefinitionId &&
        previousDefaultCredentialDefinitionId !== next.credentialDefinitionId
      ) {
        state.servicePoints = state.servicePoints.map((servicePoint) =>
          servicePoint.credentialDefinitionId === previousDefaultCredentialDefinitionId
            ? {
                ...servicePoint,
                credentialDefinitionId: next.credentialDefinitionId,
                updatedAt: next.updatedAt,
              }
            : servicePoint,
        )
      }

      await this.writeState(state)
      return next
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

  async findVendorSuspension(vendorId: string): Promise<VendorSuspensionRecord | undefined> {
    return this.withLock(async () =>
      (await this.readState()).vendorSuspensions.find((item) => item.vendorId === vendorId),
    )
  }

  /** Creates or replaces the vendor's suspension so repeated portal syncs are idempotent. */
  async upsertVendorSuspension(record: VendorSuspensionRecord): Promise<VendorSuspensionRecord> {
    return this.withLock(async () => {
      const state = await this.readState()
      state.vendorSuspensions = [
        ...state.vendorSuspensions.filter((item) => item.vendorId !== record.vendorId),
        record,
      ]
      await this.writeState(state)
      return record
    })
  }

  async deleteVendorSuspension(vendorId: string): Promise<boolean> {
    return this.withLock(async () => {
      const state = await this.readState()
      const remaining = state.vendorSuspensions.filter((item) => item.vendorId !== vendorId)
      if (remaining.length === state.vendorSuspensions.length) return false

      state.vendorSuspensions = remaining
      await this.writeState(state)
      return true
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

  async findSessionByCheckout(
    vendorServicePointIds: string[],
    checkoutId: string,
  ): Promise<VerificationSessionRecord | undefined> {
    return this.withLock(async () =>
      (await this.readState()).sessions.find(
        (item) => vendorServicePointIds.includes(item.servicePointId) && item.checkoutId === checkoutId,
      ),
    )
  }

  /**
   * Check the checkout capability and mark it claimed in one queued file update.
   * Report invalid, reused and missing claims separately so the caller does not create a second exchange.
   */
  async claimSession(
    id: string,
    claimNonceHash: string,
    claimedAt: string,
  ): Promise<{ outcome: 'CLAIMED' | 'INVALID' | 'NOT_FOUND' | 'REUSED'; session?: VerificationSessionRecord }> {
    return this.withLock(async () => {
      const state = await this.readState()
      const index = state.sessions.findIndex((item) => item.verificationRequestId === id)
      if (index < 0) return { outcome: 'NOT_FOUND' }

      const current = state.sessions[index]
      // Compare hashes in constant time after checking lengths so capability validation does
      // not reveal useful prefix information through response timing.
      const expected = Buffer.from(current.claimNonceHash ?? '')
      const actual = Buffer.from(claimNonceHash)
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        return { outcome: 'INVALID' }
      }
      if (current.claimedAt) return { outcome: 'REUSED', session: current }

      const next = { ...current, claimedAt, updatedAt: claimedAt, state: 'claiming' }
      state.sessions[index] = next
      await this.writeState(state)
      return { outcome: 'CLAIMED', session: next }
    })
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

  /**
   * Run verifier file operations in order within this process.
   * Keep the queue usable after failure while returning the error to its original caller.
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation)
    // A failed operation must not poison the queue; later requests still need a chance to run.
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  /**
   * Load saved verifier state, supplying supported older optional collections where absent.
   * Reject corrupt state instead of losing saved trust settings and session history.
   */
  private async readState(): Promise<VerificationStoreFile> {
    let raw: string

    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch (error) {
      // A missing file means a first boot. Malformed existing data is treated as corruption
      // instead of silently resetting verification history.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { servicePoints: [], sessions: [], trustedCredentialDefinitions: [], vendorSuspensions: [] }
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
        trustedCredentialDefinitions: Array.isArray(parsed.trustedCredentialDefinitions)
          ? parsed.trustedCredentialDefinitions
          : [],
        // Stores written before vendor suspensions existed load with no suspended vendors.
        vendorSuspensions: Array.isArray(parsed.vendorSuspensions) ? parsed.vendorSuspensions : [],
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

  /**
   * Write the entire snapshot to a temporary file and rename it into place.
   * This prevents partial file contents, but is not a lock between separate agent processes.
   */
  private async writeState(state: VerificationStoreFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    // Replace the complete JSON document atomically so a crash cannot leave a partially
    // written store at the configured path.
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tempPath, JSON.stringify(state, null, 2))
    await rename(tempPath, this.filePath)
  }
}

let defaultStore: VerificationStore | undefined

/** Returns the process-wide verification store configured for the agent data volume. */
export function getVerificationStore(): VerificationStore {
  defaultStore ??= new VerificationStore()
  return defaultStore
}
