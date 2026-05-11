import { createHmac } from 'node:crypto'

import { config } from '../config'

export type ConnectionStateChangedWebhookPayload = {
  connectionId: string
  outOfBandId?: string
  previousState: string | null
  state: string
  theirLabel?: string
  timestamp: string
  type: 'connection.stateChanged'
}

export type CredentialStateChangedWebhookPayload = {
  connectionId?: string
  credentialExchangeId: string
  previousState: string | null
  state: string
  timestamp: string
  type: 'credential.stateChanged'
}

export type WebhookPayload = ConnectionStateChangedWebhookPayload | CredentialStateChangedWebhookPayload

type FetchLike = (
  url: string,
  init: {
    body: string
    headers: Record<string, string>
    method: 'POST'
  },
) => Promise<{ ok: boolean; status: number; statusText?: string }>

type WebhookLogger = Pick<Console, 'warn'>

export type WebhookDispatchOptions = {
  fetchFn?: FetchLike
  logger?: WebhookLogger
  signingSecret?: string
  url?: string | null
}

function signatureFor(payload: string, signingSecret: string) {
  return `sha256=${createHmac('sha256', signingSecret).update(payload).digest('hex')}`
}

export async function dispatchWebhook(
  payload: WebhookPayload,
  options: WebhookDispatchOptions = {},
): Promise<void> {
  const url = options.url === undefined ? config.webhooks.url : options.url

  if (!url) {
    return
  }

  const fetchFn = options.fetchFn ?? globalThis.fetch
  const logger = options.logger ?? console
  const signingSecret = options.signingSecret ?? config.webhooks.signingSecret
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (signingSecret) {
    headers['X-Unify-Signature'] = signatureFor(body, signingSecret)
  }

  try {
    const response = await fetchFn(url, {
      body,
      headers,
      method: 'POST',
    })

    if (!response.ok) {
      logger.warn(
        `[events] webhook ${payload.type} failed with ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      )
    }
  } catch (error) {
    logger.warn(
      `[events] webhook ${payload.type} dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
