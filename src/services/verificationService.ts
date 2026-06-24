import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import type { ProofExchangeRecord } from '@credo-ts/core'

import type { UniversityAgent } from '../agent'
import { config } from '../config'
import { AppError } from '../errors'

import { evaluateVerification } from './verificationDecision'
import { VerificationRateLimiter } from './verificationRateLimiter'
import { getVerificationStore, type VerificationStore } from './verificationStore'
import {
  VERIFICATION_ATTRIBUTES,
  type RevealedVerificationAttributes,
  type ServicePointRecord,
  type VerificationDecision,
  type VerificationFailureCode,
  type VerificationSessionRecord,
} from './verificationTypes'

type AnonCredsPresentation = {
  requested_proof?: {
    revealed_attr_groups?: Record<
      string,
      {
        values?: Record<string, { raw?: string; encoded?: string }>
      }
    >
    revealed_attrs?: Record<string, { raw?: string; encoded?: string }>
  }
  identifiers?: Array<{ cred_def_id?: string }>
}

export type VerificationStatusResult = {
  verificationRequestId: string
  proofRecordId?: string
  vendorId: string
  servicePointId: string
  servicePointName: string
  state: string
  status: VerificationDecision
  isVerified?: boolean
  failureCode?: VerificationFailureCode
  attributes?: RevealedVerificationAttributes
  createdAt: string
  updatedAt: string
  expiresAt: string
  completedAt?: string
}

type VerificationServiceOptions = {
  now?: () => Date
  rateLimiter?: VerificationRateLimiter
  trustedCredentialDefinitionIds?: string[]
  requireNonRevoked?: boolean
  sessionTtlMinutes?: number
  resultVisibilityMinutes?: number
  maxPendingPerServicePoint?: number
  resultTokenSecret?: string
}

function generateId(prefix: string, bytes = 12): string {
  return `${prefix}-${randomBytes(bytes).toString('hex')}`
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

function isTerminal(decision: VerificationDecision): boolean {
  return decision !== 'Pending'
}

export class VerificationService {
  private readonly now: () => Date
  private readonly rateLimiter: VerificationRateLimiter
  private readonly trustedCredentialDefinitionIds: string[]
  private readonly requireNonRevoked: boolean
  private readonly sessionTtlMinutes: number
  private readonly resultVisibilityMinutes: number
  private readonly maxPendingPerServicePoint: number
  private readonly resultTokenSecret: string
  private creationQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly agent: UniversityAgent,
    private readonly store: VerificationStore = getVerificationStore(),
    options: VerificationServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.trustedCredentialDefinitionIds =
      options.trustedCredentialDefinitionIds ?? config.verifier.trustedCredentialDefinitionIds
    this.requireNonRevoked = options.requireNonRevoked ?? config.verifier.requireNonRevoked
    this.sessionTtlMinutes = options.sessionTtlMinutes ?? config.verifier.sessionTtlMinutes
    this.resultVisibilityMinutes = options.resultVisibilityMinutes ?? config.verifier.resultVisibilityMinutes
    this.maxPendingPerServicePoint =
      options.maxPendingPerServicePoint ?? config.verifier.maxPendingPerServicePoint
    this.resultTokenSecret = options.resultTokenSecret ?? config.verifier.resultTokenSecret
    this.rateLimiter =
      options.rateLimiter ??
      new VerificationRateLimiter({
        perIp: config.verifier.rateLimitPerIp,
        perServicePoint: config.verifier.rateLimitPerServicePoint,
      })
  }

  async createServicePoint(input: {
    vendorId: string
    vendorName: string
    externalId: string
    name: string
  }): Promise<ServicePointRecord & { verificationUrl: string }> {
    const now = this.now().toISOString()
    const record: ServicePointRecord = {
      id: generateId('service-point'),
      publicId: generateId('sp-public', 18),
      vendorId: input.vendorId,
      vendorName: input.vendorName,
      externalId: input.externalId,
      name: input.name,
      active: true,
      createdAt: now,
      updatedAt: now,
    }

    await this.store.insertServicePoint(record)
    return this.withVerificationUrl(record)
  }

  async listServicePoints(): Promise<Array<ServicePointRecord & { verificationUrl: string }>> {
    const records = await this.store.listServicePoints()
    return records.map((record) => this.withVerificationUrl(record))
  }

  async getServicePoint(id: string): Promise<ServicePointRecord & { verificationUrl: string }> {
    const record = await this.store.findServicePointById(id)
    if (!record) {
      throw new AppError(404, 'Service point was not found.', undefined, 'SERVICE_POINT_NOT_FOUND')
    }
    return this.withVerificationUrl(record)
  }

  async updateServicePoint(
    id: string,
    input: { name?: string; vendorName?: string; active?: boolean },
  ): Promise<ServicePointRecord & { verificationUrl: string }> {
    const updated = await this.store.updateServicePoint(id, (record) => ({
      ...record,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.vendorName !== undefined ? { vendorName: input.vendorName } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updatedAt: this.now().toISOString(),
    }))

    if (!updated) {
      throw new AppError(404, 'Service point was not found.', undefined, 'SERVICE_POINT_NOT_FOUND')
    }
    return this.withVerificationUrl(updated)
  }

  async startSession(input: {
    publicServicePointId: string
    clientRequestId: string
    requestIp: string
  }): Promise<{
    verificationRequestId: string
    invitationUrl: string
    vendorName: string
    servicePointName: string
    requestedAttributes: readonly string[]
    expiresAt: string
    resultToken: string
  }> {
    return this.withCreationLock(async () => {
      const servicePoint = await this.store.findServicePointByPublicId(input.publicServicePointId)
      if (!servicePoint) {
        throw new AppError(404, 'Service point was not found.', undefined, 'SERVICE_POINT_NOT_FOUND')
      }
      if (!servicePoint.active) {
        throw new AppError(410, 'Service point verification is disabled.', undefined, 'SERVICE_POINT_DISABLED')
      }

      const existing = await this.store.findSessionByClientRequest(servicePoint.id, input.clientRequestId)
      if (existing) {
        if (this.now().getTime() >= new Date(existing.expiresAt).getTime()) {
          throw new AppError(
            409,
            'The previous verification request has expired. Start a new request.',
            undefined,
            'CLIENT_REQUEST_EXPIRED',
          )
        }
        return this.startResponse(existing, servicePoint)
      }

      const pendingSessions = (await this.store.listSessionsByServicePoint(servicePoint.id)).filter(
        (session) => session.decision === 'Pending' && this.now().getTime() < new Date(session.expiresAt).getTime(),
      )
      if (pendingSessions.length >= this.maxPendingPerServicePoint) {
        throw new AppError(
          429,
          'This service point has too many pending verification sessions.',
          undefined,
          'VERIFICATION_SERVICE_POINT_BUSY',
        )
      }

      this.rateLimiter.check(input.requestIp, servicePoint.id, this.now().getTime())
      this.assertVerifierConfigured()

      const proofFormats = {
        anoncreds: {
          name: 'UNIFY Active Student Verification',
          version: '1.0',
          requested_attributes: {
            student_details: {
              names: [...VERIFICATION_ATTRIBUTES],
              restrictions: this.trustedCredentialDefinitionIds.map((credentialDefinitionId) => ({
                cred_def_id: credentialDefinitionId,
              })),
            },
          },
          requested_predicates: {},
          ...(this.requireNonRevoked
            ? { non_revoked: { to: Math.floor(this.now().getTime() / 1000) } }
            : {}),
        },
      }

      let proofRecord: ProofExchangeRecord
      let message: unknown
      try {
        const created = await this.agent.proofs.createRequest({
          protocolVersion: 'v2',
          proofFormats,
          comment: `Verify active student access for ${servicePoint.name}`,
        })
        proofRecord = created.proofRecord
        message = created.message
      } catch (error) {
        throw new AppError(
          422,
          `Credo could not create the proof request: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          'CREDO_PROTOCOL_ERROR',
        )
      }

      let outOfBandRecord: Awaited<ReturnType<UniversityAgent['oob']['createInvitation']>>
      try {
        outOfBandRecord = await this.agent.oob.createInvitation({ messages: [message as never] })
      } catch (error) {
        await this.agent.proofs.deleteById(proofRecord.id).catch(() => undefined)
        throw new AppError(
          422,
          `Credo could not create the proof invitation: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          'CREDO_PROTOCOL_ERROR',
        )
      }

      const createdAt = this.now()
      const session: VerificationSessionRecord = {
        verificationRequestId: generateId('verification'),
        proofRecordId: proofRecord.id,
        outOfBandId: outOfBandRecord.id,
        servicePointId: servicePoint.id,
        clientRequestId: input.clientRequestId,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        expiresAt: addMinutes(createdAt, this.sessionTtlMinutes).toISOString(),
        state: proofRecord.state,
        decision: 'Pending',
      }

      await this.store.insertSession(session)
      return this.startResponse(session, servicePoint, outOfBandRecord)
    })
  }

  async getWalletResult(
    verificationRequestId: string,
    resultToken: string | undefined,
  ): Promise<{
    status: VerificationDecision
    failureCode?: VerificationFailureCode
    expiresAt: string
    completedAt?: string
  }> {
    this.assertResultToken(verificationRequestId, resultToken)

    const session = await this.store.findSessionById(verificationRequestId)
    if (!session) {
      throw new AppError(404, 'Verification request was not found.', undefined, 'VERIFICATION_REQUEST_NOT_FOUND')
    }

    const status = await this.syncSession(session)
    const latest = await this.store.findSessionById(verificationRequestId)
    const visibleUntil = latest?.detailsVisibleUntil

    if (visibleUntil && this.now().getTime() >= new Date(visibleUntil).getTime()) {
      throw new AppError(
        410,
        'The verification result is no longer available.',
        undefined,
        'VERIFICATION_RESULT_EXPIRED',
      )
    }

    return {
      status: status.status,
      ...(status.failureCode ? { failureCode: status.failureCode } : {}),
      expiresAt: status.expiresAt,
      ...(status.completedAt ? { completedAt: status.completedAt } : {}),
    }
  }

  async getStatus(id: string): Promise<VerificationStatusResult> {
    const session = await this.store.findSessionById(id)
    if (!session) {
      throw new AppError(404, 'Verification request was not found.', undefined, 'VERIFICATION_REQUEST_NOT_FOUND')
    }

    return this.syncSession(session)
  }

  async listSessions(servicePointId: string): Promise<VerificationStatusResult[]> {
    await this.getServicePoint(servicePointId)
    const sessions = await this.store.listSessionsByServicePoint(servicePointId)
    const statuses = await Promise.all(sessions.map((session) => this.syncSession(session)))
    const now = this.now().getTime()

    return statuses
      .filter((status) => status.status === 'Pending' || !status.completedAt || now < new Date(status.completedAt).getTime() + this.resultVisibilityMinutes * 60_000)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 50)
  }

  async handleProofStateChanged(proofRecord: ProofExchangeRecord): Promise<VerificationStatusResult | undefined> {
    const session = await this.store.findSessionByProofRecordId(proofRecord.id)
    if (!session) return undefined
    return this.syncSession(session, proofRecord)
  }

  async runCleanup(): Promise<void> {
    const sessions = await this.store.listSessions()

    for (const session of sessions) {
      try {
        const status = await this.syncSession(session)
        const latest = await this.store.findSessionById(session.verificationRequestId)
        if (!latest || latest.proofRecordDeletedAt || status.status === 'Pending') continue

        const visibleUntil = latest.detailsVisibleUntil
        if (!visibleUntil || this.now().getTime() < new Date(visibleUntil).getTime()) continue

        const proofRecord = await this.agent.proofs.findById(latest.proofRecordId)
        if (proofRecord) await this.agent.proofs.deleteById(latest.proofRecordId)
        const outOfBandRecord = await this.agent.oob.findById(latest.outOfBandId)
        if (outOfBandRecord) await this.agent.oob.deleteById(latest.outOfBandId)
        await this.store.updateSession(latest.verificationRequestId, (record) => ({
          ...record,
          proofRecordDeletedAt: this.now().toISOString(),
          updatedAt: this.now().toISOString(),
        }))
      } catch (error) {
        console.warn(
          `[verification-cleanup] ${session.verificationRequestId} failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  private async syncSession(
    session: VerificationSessionRecord,
    providedProofRecord?: ProofExchangeRecord,
  ): Promise<VerificationStatusResult> {
    const servicePoint = await this.getServicePoint(session.servicePointId)
    if (session.proofRecordDeletedAt) {
      return this.statusFromStoredSession(session, servicePoint)
    }

    let proofRecord = providedProofRecord
    let attributes: Partial<RevealedVerificationAttributes> | undefined
    let credentialDefinitionIds: string[] = []

    if (!session.proofRecordDeletedAt) {
      proofRecord ??= await this.agent.proofs.findById(session.proofRecordId) ?? undefined
      if (proofRecord?.state === 'done' && proofRecord.isVerified === true) {
        const presentation = await this.presentationFor(session.proofRecordId)
        attributes = presentation.attributes
        credentialDefinitionIds = presentation.credentialDefinitionIds
      }
    }

    const proofFinishedBeforeExpiry =
      proofRecord?.state === 'done' &&
      proofRecord.updatedAt !== undefined &&
      proofRecord.updatedAt.getTime() <= new Date(session.expiresAt).getTime()
    const expired =
      session.decision === 'Pending' &&
      this.now().getTime() >= new Date(session.expiresAt).getTime() &&
      !proofFinishedBeforeExpiry
    const proofRecordMissing = !proofRecord && !expired

    const evaluation = evaluateVerification({
      state: proofRecordMissing ? 'abandoned' : proofRecord?.state ?? session.state,
      isVerified: proofRecord?.isVerified ?? session.isVerified,
      errorMessage: proofRecordMissing ? 'Credo proof record is missing.' : proofRecord?.errorMessage,
      credentialDefinitionIds,
      trustedCredentialDefinitionIds: this.trustedCredentialDefinitionIds,
      attributes,
      expired,
    })

    const becameTerminal = isTerminal(evaluation.decision) && !session.completedAt
    const terminalAt = expired ? new Date(session.expiresAt) : this.now()
    const completedAt = becameTerminal ? terminalAt.toISOString() : session.completedAt
    const detailsVisibleUntil = becameTerminal
      ? addMinutes(terminalAt, this.resultVisibilityMinutes).toISOString()
      : session.detailsVisibleUntil

    const updated = await this.store.updateSession(session.verificationRequestId, (record) => ({
      ...record,
      state: proofRecord?.state ?? record.state,
      decision: evaluation.decision,
      ...(proofRecord?.isVerified !== undefined ? { isVerified: proofRecord.isVerified } : {}),
      ...(evaluation.failureCode ? { failureCode: evaluation.failureCode } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(detailsVisibleUntil ? { detailsVisibleUntil } : {}),
      updatedAt: this.now().toISOString(),
    }))

    const record = updated ?? session
    const detailsVisible = !record.detailsVisibleUntil || this.now().getTime() < new Date(record.detailsVisibleUntil).getTime()

    return {
      verificationRequestId: record.verificationRequestId,
      ...(record.proofRecordDeletedAt ? {} : { proofRecordId: record.proofRecordId }),
      vendorId: servicePoint.vendorId,
      servicePointId: servicePoint.id,
      servicePointName: servicePoint.name,
      state: record.state,
      status: record.decision,
      ...(record.isVerified !== undefined ? { isVerified: record.isVerified } : {}),
      ...(record.failureCode ? { failureCode: record.failureCode } : {}),
      ...(detailsVisible && evaluation.attributes ? { attributes: evaluation.attributes } : {}),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    }
  }

  private statusFromStoredSession(
    record: VerificationSessionRecord,
    servicePoint: ServicePointRecord,
  ): VerificationStatusResult {
    return {
      verificationRequestId: record.verificationRequestId,
      vendorId: servicePoint.vendorId,
      servicePointId: servicePoint.id,
      servicePointName: servicePoint.name,
      state: record.state,
      status: record.decision,
      ...(record.isVerified !== undefined ? { isVerified: record.isVerified } : {}),
      ...(record.failureCode ? { failureCode: record.failureCode } : {}),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    }
  }

  private async presentationFor(proofRecordId: string): Promise<{
    attributes?: Partial<RevealedVerificationAttributes>
    credentialDefinitionIds: string[]
  }> {
    try {
      const formatData = await this.agent.proofs.getFormatData(proofRecordId)
      const presentation = (formatData.presentation as { anoncreds?: AnonCredsPresentation } | undefined)?.anoncreds
      if (!presentation) return { credentialDefinitionIds: [] }

      const attributes: Partial<RevealedVerificationAttributes> = {}
      const group = presentation.requested_proof?.revealed_attr_groups?.student_details?.values
      if (group) {
        for (const name of VERIFICATION_ATTRIBUTES) {
          const raw = group[name]?.raw
          if (typeof raw === 'string') attributes[name] = raw
        }
      }

      return {
        attributes,
        credentialDefinitionIds: [
          ...new Set(
            (presentation.identifiers ?? [])
              .map((identifier) => identifier.cred_def_id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
          ),
        ],
      }
    } catch (error) {
      throw new AppError(
        422,
        `Unable to read the AnonCreds presentation: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'CREDO_PROTOCOL_ERROR',
      )
    }
  }

  private async startResponse(
    session: VerificationSessionRecord,
    servicePoint: ServicePointRecord,
    suppliedOutOfBandRecord?: Awaited<ReturnType<UniversityAgent['oob']['createInvitation']>>,
  ) {
    const outOfBandRecord = suppliedOutOfBandRecord ?? (await this.agent.oob.getById(session.outOfBandId))
    return {
      verificationRequestId: session.verificationRequestId,
      invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({ domain: config.agent.endpoint }),
      vendorName: servicePoint.vendorName,
      servicePointName: servicePoint.name,
      requestedAttributes: VERIFICATION_ATTRIBUTES,
      expiresAt: session.expiresAt,
      resultToken: this.resultTokenFor(session.verificationRequestId),
    }
  }

  private resultTokenFor(verificationRequestId: string): string {
    return createHmac('sha256', this.resultTokenSecret)
      .update(`wallet-verification-result:${verificationRequestId}`)
      .digest('base64url')
  }

  private assertResultToken(verificationRequestId: string, suppliedToken: string | undefined): void {
    const expectedToken = this.resultTokenFor(verificationRequestId)
    const suppliedBuffer = Buffer.from(suppliedToken ?? '')
    const expectedBuffer = Buffer.from(expectedToken)
    const valid =
      suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer)

    if (!valid) {
      throw new AppError(
        401,
        'Missing or invalid verification result token.',
        undefined,
        'INVALID_VERIFICATION_RESULT_TOKEN',
      )
    }
  }

  private withVerificationUrl(record: ServicePointRecord): ServicePointRecord & { verificationUrl: string } {
    return {
      ...record,
      verificationUrl: `${config.verifier.publicBaseUrl}/verify/${encodeURIComponent(record.publicId)}`,
    }
  }

  private assertVerifierConfigured(): void {
    if (this.trustedCredentialDefinitionIds.length === 0) {
      throw new AppError(
        503,
        'No trusted credential definition ids are configured for verification.',
        undefined,
        'VERIFIER_NOT_CONFIGURED',
      )
    }
  }

  private async withCreationLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.creationQueue.then(operation, operation)
    this.creationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
