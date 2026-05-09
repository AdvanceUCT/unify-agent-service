import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { config } from '../config'

export type StoredActivationRecord = {
  activationId: string
  completedAt?: string
  createdAt: string
  credentialExchangeId: string
  credentialRecordId?: string
  email?: string
  expiresAt: string
  externalId?: string
  holderConnectionId?: string
  invitationId: string
  invitationUrl: string
  issuerLabel: string
  ledgerName: string
  mediatorInvitationUrl?: string
  studentId: string
  tokenHash: string
  walletId: string
}

type ActivationStoreFile = {
  activations: StoredActivationRecord[]
}

export function generateActivationToken(): string {
  return randomBytes(32).toString('base64url')
}

export function generateActivationId(): string {
  return `activation-${randomBytes(12).toString('hex')}`
}

export function hashActivationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class ActivationStore {
  constructor(private readonly filePath = config.activations.storeFile) {}

  async save(record: StoredActivationRecord): Promise<void> {
    const activations = await this.readAll()
    const existingIndex = activations.findIndex((activation) => activation.activationId === record.activationId)

    if (existingIndex >= 0) {
      activations[existingIndex] = record
    } else {
      activations.push(record)
    }

    await this.writeAll(activations)
  }

  async findByToken(token: string): Promise<StoredActivationRecord | undefined> {
    const tokenHash = hashActivationToken(token)
    const activations = await this.readAll()
    return activations.find((activation) => activation.tokenHash === tokenHash)
  }

  async findByActivationId(activationId: string): Promise<StoredActivationRecord | undefined> {
    const activations = await this.readAll()
    return activations.find((activation) => activation.activationId === activationId)
  }

  async clear(): Promise<void> {
    await this.writeAll([])
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
