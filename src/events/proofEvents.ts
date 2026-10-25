/**
 * @fileoverview Feeds Credo proof state changes into the verifier's authoritative session state.
 * @module events/proofEvents
 */

import { ProofEventTypes, type ProofStateChangedEvent } from '@credo-ts/core'

import type { UniversityAgent } from '../agent'
import { VerificationService } from '../services/verificationService'

import { dispatchWebhook } from './webhookDispatcher'

type ProofEventVerifier = Pick<VerificationService, 'handleProofStateChanged'>
type ProofWebhookDispatcher = typeof dispatchWebhook

/**
 * Translate proof state changes into the verifier's saved decisions before sending completion notifications.
 * Use a stable event identity derived from the saved completion time so the portal can recognize repeated notifications.
 */
export function registerProofEventHandlers(
  agent: UniversityAgent,
  verifier: ProofEventVerifier = new VerificationService(agent),
  webhookDispatcher: ProofWebhookDispatcher = dispatchWebhook,
): void {

  agent.events.on<ProofStateChangedEvent>(ProofEventTypes.ProofStateChanged, async ({ payload }) => {
    const { proofRecord, previousState } = payload
    console.log(`[events] proof ${proofRecord.id}: ${previousState ?? '∅'} → ${proofRecord.state}`)

    try {
      const status = await verifier.handleProofStateChanged(proofRecord)
      if (!status || status.status === 'Pending' || !status.completedAt) return

      void webhookDispatcher({
        eventId: `verification:${status.verificationRequestId}:${status.completedAt}`,
        verificationRequestId: status.verificationRequestId,
        ...(status.checkoutId ? { checkoutId: status.checkoutId } : {}),
        vendorId: status.vendorId,
        servicePointId: status.servicePointId,
        decision: status.status,
        ...(status.isVerified !== undefined ? { isVerified: status.isVerified } : {}),
        ...(status.attributes ? { attributes: status.attributes } : {}),
        failureCode: status.failureCode,
        expiresAt: status.expiresAt,
        completedAt: status.completedAt,
        timestamp: new Date().toISOString(),
        type: 'verification.completed',
      })
    } catch (error) {
      console.warn(
        `[events] proof ${proofRecord.id} synchronization failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
}
