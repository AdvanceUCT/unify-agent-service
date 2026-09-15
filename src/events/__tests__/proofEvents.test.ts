import { registerProofEventHandlers } from '../proofEvents'

function setup(status?: Record<string, unknown>) {
  let handler: ((event: unknown) => Promise<void>) | undefined
  const agent = {
    events: {
      on: jest.fn((_type, registeredHandler) => {
        handler = registeredHandler
      }),
    },
  }
  const verifier = {
    handleProofStateChanged: jest.fn().mockResolvedValue(status),
  }
  const webhookDispatcher = jest.fn().mockResolvedValue(undefined)

  registerProofEventHandlers(agent as never, verifier as never, webhookDispatcher)

  return {
    verifier,
    webhookDispatcher,
    emit: async (proofRecord: Record<string, unknown>, previousState: string | null = null) => {
      await handler?.({ payload: { proofRecord, previousState } })
    },
  }
}

describe('registerProofEventHandlers', () => {
  it('correlates proof state changes and emits the disclosed attributes to the signed portal webhook', async () => {
    const context = setup({
      verificationRequestId: 'verification-001',
      vendorId: 'vendor-001',
      servicePointId: 'service-point-001',
      status: 'Approved',
      isVerified: true,
      completedAt: '2026-06-23T10:00:00.000Z',
      expiresAt: '2026-06-23T10:05:00.000Z',
      attributes: {
        firstName: 'Caleb',
        lastName: 'Voskuil',
        studentNumber: 'VOSCAL100',
        institution: 'University of Cape Town',
      },
    })

    await context.emit({ id: 'proof-001', state: 'done' }, 'presentation-received')

    expect(context.webhookDispatcher).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationRequestId: 'verification-001',
        eventId: 'verification:verification-001:2026-06-23T10:00:00.000Z',
        vendorId: 'vendor-001',
        servicePointId: 'service-point-001',
        decision: 'Approved',
        isVerified: true,
        attributes: {
          firstName: 'Caleb',
          lastName: 'Voskuil',
          studentNumber: 'VOSCAL100',
          institution: 'University of Cape Town',
        },
        type: 'verification.completed',
      }),
    )
  })

  it('ignores Credo proof records that do not belong to verifier sessions', async () => {
    const context = setup(undefined)
    await context.emit({ id: 'unrelated-proof', state: 'request-received' })
    expect(context.webhookDispatcher).not.toHaveBeenCalled()
  })

  it('does not let synchronization failures escape into Credo event processing', async () => {
    const context = setup()
    context.verifier.handleProofStateChanged.mockRejectedValueOnce(new Error('store offline'))
    await expect(context.emit({ id: 'proof-001', state: 'done' })).resolves.toBeUndefined()
    expect(context.webhookDispatcher).not.toHaveBeenCalled()
  })
})
