/**
 * @fileoverview Creates activation records for credential offers and builds the student-facing link.
 * @module services/activationLinkService
 */

import { createHash, createHmac } from 'node:crypto'
import { URLSearchParams } from 'node:url'

import type { UniversityAgent } from '../agent'
import { config } from '../config'

import {
  ActivationStore,
  generateActivationId,
  generateActivationToken,
  hashActivationToken,
  type StoredActivationRecord,
} from './activationStore'
import { CredentialService } from './credentialService'

type StudentActivationInput = {
  attributes: Array<{ name: string; value: string }>
  email?: string
  externalId?: string
  idempotencyKey?: string
}

export type BatchActivationLinkResult = {
  failures: Array<{ email?: string; externalId?: string; message: string }>
  offers: Array<{
    activationId: string
    activationUrl: string
    credentialExchangeId: string
    credentialRevocationId?: string
    outOfBandId: string
    revocationRegistryDefinitionId?: string
    email?: string
    expiresAt: string
    externalId?: string
  }>
}

function suffixFor(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'demo'
}

function invitationIdFromUrl(invitationUrl: string, fallback: string) {
  try {
    const parsed = new URL(invitationUrl)
    const oob = parsed.searchParams.get('oob')
    return oob ? `oob-${suffixFor(oob)}` : fallback
  } catch {
    return fallback
  }
}

function activationUrlForToken(token: string): string {
  // The student receives the tokenized app link, not the raw OOB invitation.
  return `${config.activations.walletActivationRoute}?${new URLSearchParams({ token }).toString()}`
}

function idempotencyKeyHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function tokenForIdempotencyKey(value: string) {
  return createHmac('sha256', config.activations.idempotencySecret).update(value).digest('base64url')
}

function expiresAtFrom(createdAt: Date): string {
  const expiresAt = new Date(createdAt)
  expiresAt.setHours(expiresAt.getHours() + config.activations.tokenTtlHours)
  return expiresAt.toISOString()
}

function optionalStringProperty(value: object, key: string): string | undefined {
  const property = (value as Record<string, unknown>)[key]
  return typeof property === 'string' && property ? property : undefined
}

/** Couples a credential offer to an expiring activation capability for the wallet. */
export class ActivationLinkService {
  private readonly credentials: CredentialService
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(
    agent: UniversityAgent,
    private readonly store = new ActivationStore(),
  ) {
    this.credentials = new CredentialService(agent)
  }

  async createBatchActivationLinks(params: {
    credentialDefinitionId: string
    revocationRegistryDefinitionId?: string
    students: StudentActivationInput[]
  }): Promise<BatchActivationLinkResult> {
    const operation = () => this.createBatchActivationLinksUnlocked(params)
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  private async createBatchActivationLinksUnlocked(params: {
    credentialDefinitionId: string
    revocationRegistryDefinitionId?: string
    students: StudentActivationInput[]
  }): Promise<BatchActivationLinkResult> {
    const startedAt = Date.now()
    const recordsToSave: StoredActivationRecord[] = []
    const outcomes = new Array<
      | { kind: 'offer'; value: BatchActivationLinkResult['offers'][number] }
      | { kind: 'failure'; value: BatchActivationLinkResult['failures'][number] }
    >(params.students.length)
    let replayedCount = 0

    console.info('[activation-links] batch started', {
      concurrency: config.activations.batchConcurrency,
      requestedCount: params.students.length,
      revocable: Boolean(params.revocationRegistryDefinitionId),
    })

    try {
      const keyedStudents = params.students
        .map((student, inputIndex) => ({
          inputIndex,
          keyHash: student.idempotencyKey ? idempotencyKeyHash(student.idempotencyKey) : undefined,
          student,
        }))
      const existingByKeyHash = await this.store.findByIdempotencyKeyHashes(
        keyedStudents.flatMap(({ keyHash }) => (keyHash ? [keyHash] : [])),
      )
      const studentsToIssue: Array<{
        inputIndex: number
        keyHash?: string
        student: StudentActivationInput
        token: string
      }> = []
      const batchTime = new Date()

      for (const entry of keyedStudents) {
        const token = entry.student.idempotencyKey
          ? tokenForIdempotencyKey(entry.student.idempotencyKey)
          : generateActivationToken()
        const existing = entry.keyHash ? existingByKeyHash.get(entry.keyHash) : undefined

        if (!existing) {
          studentsToIssue.push({ ...entry, token })
          continue
        }

        replayedCount += 1
        const expiresAt = expiresAtFrom(batchTime)
        recordsToSave.push({ ...existing, expiresAt, tokenHash: hashActivationToken(token) })
        outcomes[entry.inputIndex] = {
          kind: 'offer',
          value: {
            activationId: existing.activationId,
            activationUrl: activationUrlForToken(token),
            credentialExchangeId: existing.credentialExchangeId,
            outOfBandId: existing.outOfBandId ?? existing.invitationId,
            expiresAt,
            ...(existing.credentialRevocationId
              ? { credentialRevocationId: existing.credentialRevocationId }
              : {}),
            ...(existing.revocationRegistryDefinitionId
              ? { revocationRegistryDefinitionId: existing.revocationRegistryDefinitionId }
              : {}),
            ...(entry.student.email ? { email: entry.student.email } : {}),
            ...(entry.student.externalId ? { externalId: entry.student.externalId } : {}),
          },
        }
      }

      if (studentsToIssue.length > 0) {
        const offerResults = await this.credentials.createBatchOfferResults({
          credentialDefinitionId: params.credentialDefinitionId,
          ...(params.revocationRegistryDefinitionId
            ? { revocationRegistryDefinitionId: params.revocationRegistryDefinitionId }
            : {}),
          students: studentsToIssue.map(({ student }) => student),
        })

        for (let index = 0; index < offerResults.length; index += 1) {
          const pending = studentsToIssue[index]
          const offerResult = offerResults[index]

          if (!offerResult.offer) {
            outcomes[pending.inputIndex] = {
              kind: 'failure',
              value: {
                ...(pending.student.email ? { email: pending.student.email } : {}),
                ...(pending.student.externalId ? { externalId: pending.student.externalId } : {}),
                message: offerResult.message ?? 'Credential offer creation failed.',
              },
            }
            continue
          }

          const offer = offerResult.offer
          const activationId = generateActivationId()
          const credentialRevocationId = optionalStringProperty(offer, 'credentialRevocationId')
          const revocationRegistryDefinitionId = optionalStringProperty(offer, 'revocationRegistryDefinitionId')
          const invitationId = invitationIdFromUrl(offer.invitationUrl, `unify-oob-${suffixFor(activationId)}`)
          const expiresAt = expiresAtFrom(batchTime)
          const record: StoredActivationRecord = {
            activationId,
            createdAt: batchTime.toISOString(),
            credentialExchangeId: offer.credentialExchangeId,
            expiresAt,
            invitationId,
            invitationUrl: offer.invitationUrl,
            ...(pending.keyHash ? { idempotencyKeyHash: pending.keyHash } : {}),
            issuerLabel: config.activations.issuerLabel,
            outOfBandId: offer.outOfBandId,
            tokenHash: hashActivationToken(pending.token),
            ...(credentialRevocationId ? { credentialRevocationId } : {}),
            ...(revocationRegistryDefinitionId ? { revocationRegistryDefinitionId } : {}),
          }
          recordsToSave.push(record)
          outcomes[pending.inputIndex] = {
            kind: 'offer',
            value: {
              activationId,
              activationUrl: activationUrlForToken(pending.token),
              credentialExchangeId: offer.credentialExchangeId,
              outOfBandId: offer.outOfBandId,
              expiresAt,
              ...(pending.student.email ? { email: pending.student.email } : {}),
              ...(pending.student.externalId ? { externalId: pending.student.externalId } : {}),
              ...(credentialRevocationId ? { credentialRevocationId } : {}),
              ...(revocationRegistryDefinitionId ? { revocationRegistryDefinitionId } : {}),
            },
          }
        }
      }

      await this.store.saveMany(recordsToSave)
      const offers = outcomes.flatMap((outcome) => outcome?.kind === 'offer' ? [outcome.value] : [])
      const failures = outcomes.flatMap((outcome) => outcome?.kind === 'failure' ? [outcome.value] : [])

      console.info('[activation-links] batch completed', {
        concurrency: config.activations.batchConcurrency,
        durationMs: Date.now() - startedAt,
        failedCount: failures.length,
        newCount: studentsToIssue.length,
        replayedCount,
        requestedCount: params.students.length,
        revocable: Boolean(params.revocationRegistryDefinitionId),
        successfulCount: offers.length,
      })

      return { offers, failures }
    } catch (error) {
      console.error('[activation-links] batch failed', {
        concurrency: config.activations.batchConcurrency,
        durationMs: Date.now() - startedAt,
        replayedCount,
        requestedCount: params.students.length,
        revocable: Boolean(params.revocationRegistryDefinitionId),
      })
      throw error
    }
  }
}
