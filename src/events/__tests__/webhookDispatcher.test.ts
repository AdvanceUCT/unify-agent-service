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
      url: 'https://admin.example.test/api/webhooks/agent',
    })

    expect(fetchFn).toHaveBeenCalledWith('https://admin.example.test/api/webhooks/agent', {
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
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
      signingSecret: 'webhook-secret',
      url: 'https://admin.example.test/api/webhooks/agent',
    })

    expect(fetchFn).toHaveBeenCalledWith(
      'https://admin.example.test/api/webhooks/agent',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
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
        url: 'https://admin.example.test/api/webhooks/agent',
      }),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      '[events] webhook credential.stateChanged failed with 500 Internal Server Error',
    )
  })

  it('logs network failures without throwing', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('network offline'))
    const logger = { warn: jest.fn() }

    await expect(
      dispatchWebhook(payload, {
        fetchFn,
        logger,
        url: 'https://admin.example.test/api/webhooks/agent',
      }),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      '[events] webhook credential.stateChanged dispatch failed: network offline',
    )
  })
})
