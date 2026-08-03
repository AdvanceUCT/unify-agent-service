import { ProofEventTypes, type ProofStateChangedEvent } from '@credo-ts/core'

import type { UniversityAgent } from '../agent'
import { VerificationService } from '../services/verificationService'

import { dispatchWebhook } from './webhookDispatcher'

type ProofEventVerifier = Pick<VerificationService, 'handleProofStateChanged'>
type ProofWebhookDispatcher = typeof dispatchWebhook

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
