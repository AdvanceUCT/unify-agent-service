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
      if (!status) return

      void webhookDispatcher({
        verificationRequestId: status.verificationRequestId,
        proofRecordId: proofRecord.id,
        vendorId: status.vendorId,
        servicePointId: status.servicePointId,
        previousState,
        state: proofRecord.state,
        isVerified: status.isVerified,
        decision: status.status,
        failureCode: status.failureCode,
        timestamp: new Date().toISOString(),
        type: 'proof.stateChanged',
      })
    } catch (error) {
      console.warn(
        `[events] proof ${proofRecord.id} synchronization failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
}
