import { createHmac } from 'node:crypto'

import { dispatchWebhook, type WebhookPayload } from '../webhookDispatcher'

const payload: WebhookPayload = {
  connectionId: 'connection-001',
  credentialExchangeId: 'credential-exchange-001',
  previousState: 'credential-issued',
  state: 'done',
  timestamp: '2026-05-10T12:00:00.000Z',
  type: 'credential.stateChanged',
}

describe('dispatchWebhook', () => {
  it('posts webhook payloads as JSON', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 202 })

    await dispatchWebhook(payload, {
      fetchFn,
      requestId: 'request-001',
      url: 'https://admin.example.test/api/webhooks/agent',
    })

    expect(fetchFn).toHaveBeenCalledWith('https://admin.example.test/api/webhooks/agent', {
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': 'request-001',
      },
      method: 'POST',
    })
  })

  it('adds an HMAC signature when a signing secret is configured', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 202 })
    const body = JSON.stringify(payload)
    const signature = `sha256=${createHmac('sha256', 'webhook-secret').update(body).digest('hex')}`

    await dispatchWebhook(payload, {
      fetchFn,
      requestId: 'request-002',
      signingSecret: 'webhook-secret',
      url: 'https://admin.example.test/api/webhooks/agent',
    })

    expect(fetchFn).toHaveBeenCalledWith(
      'https://admin.example.test/api/webhooks/agent',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'request-002',
          'X-Unify-Signature': signature,
        },
      }),
    )
  })

  it('does nothing when no webhook URL is configured', async () => {
    const fetchFn = jest.fn()

    await dispatchWebhook(payload, {
      fetchFn,
      url: null,
    })

    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('logs non-2xx webhook responses without throwing', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' })
    const logger = { warn: jest.fn() }

    await expect(
      dispatchWebhook(payload, {
        fetchFn,
        logger,
        requestId: 'request-003',
        url: 'https://admin.example.test/api/webhooks/agent',
      }),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      '[events] [request-003] webhook credential.stateChanged failed with 500 Internal Server Error',
    )
  })

  it('logs network failures without throwing', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('network offline'))
    const logger = { warn: jest.fn() }

    await expect(
      dispatchWebhook(payload, {
        fetchFn,
        logger,
        requestId: 'request-004',
        url: 'https://admin.example.test/api/webhooks/agent',
      }),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      '[events] [request-004] webhook credential.stateChanged dispatch failed: network offline',
    )
  })

  it('dispatches proof results without requiring revealed student attributes', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 202 })
    const proofPayload: WebhookPayload = {
      eventId: 'verification:verification-001:2026-06-23T10:00:00.000Z',
      verificationRequestId: 'verification-001',
      vendorId: 'vendor-001',
      servicePointId: 'service-point-001',
      decision: 'Approved',
      expiresAt: '2026-06-23T10:05:00.000Z',
      completedAt: '2026-06-23T10:00:00.000Z',
      timestamp: '2026-06-23T10:00:00.000Z',
      type: 'verification.completed',
    }

    await dispatchWebhook(proofPayload, { fetchFn, url: 'https://admin.example.test/api/webhooks/agent' })

    const body = String(fetchFn.mock.calls[0][1].body)
    expect(body).toContain('verification-001')
    expect(body).not.toContain('studentNumber')
  })
})
