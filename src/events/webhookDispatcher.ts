import { createHmac, randomUUID } from 'node:crypto'

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
  credentialRevocationId?: string
  previousState: string | null
  revocationRegistryDefinitionId?: string
  state: string
  timestamp: string
  type: 'credential.stateChanged'
}

export type CredentialLifecycleChangedWebhookPayload = {
  credentialExchangeId: string
  credentialRevocationId: string
  eventId: string
  previousStatus: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'
  reason?: string
  revocationRegistryDefinitionId: string
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'
  statusListTimestamp?: number
  timestamp: string
  type: 'credential.lifecycleChanged'
}

export type VerificationCompletedWebhookPayload = {
  eventId: string
  verificationRequestId: string
  checkoutId?: string
  vendorId: string
  servicePointId: string
  decision: string
  failureCode?: string
  expiresAt: string
  completedAt: string
  timestamp: string
  type: 'verification.completed'
}

export type WebhookPayload =
  | ConnectionStateChangedWebhookPayload
  | CredentialStateChangedWebhookPayload
  | CredentialLifecycleChangedWebhookPayload
  | VerificationCompletedWebhookPayload

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
  requestId?: string
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
    // Local dev can run without a portal callback URL.
    return
  }

  const fetchFn = options.fetchFn ?? globalThis.fetch
  const logger = options.logger ?? console
  const signingSecret = options.signingSecret ?? config.webhooks.signingSecret
  const requestId = options.requestId ?? randomUUID()
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
  }

  if (signingSecret) {
    // The portal can verify this without sharing the API bearer token.
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
        `[events] [${requestId}] webhook ${payload.type} failed with ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      )
    }
  } catch (error) {
    logger.warn(
      `[events] [${requestId}] webhook ${payload.type} dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
