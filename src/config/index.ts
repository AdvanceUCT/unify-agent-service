import { homedir } from 'node:os'
import { join } from 'node:path'

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function parsePort(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Environment variable ${name} must be a valid TCP port (got "${raw}")`)
  }
  return parsed
}

function parsePositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer (got "${raw}")`)
  }

  return parsed
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

const apiPort = parsePort('API_PORT', 3000)

export const config = {
  agent: {
    // This label shows up in DIDComm handshakes and logs.
    label: requireEnv('AGENT_NAME', 'university-identity-agent'),
    // Askar uses this to name the encrypted wallet store.
    walletId: requireEnv('AGENT_WALLET_ID', 'university-agent-wallet'),
    // Never use the fallback wallet key outside a throwaway local container.
    walletKey: requireEnv('AGENT_WALLET_KEY', 'change-this-to-a-secure-key'),
    // This must be reachable by the student wallet, not just by the API server.
    endpoint: requireEnv('AGENT_ENDPOINT', 'http://localhost:3001'),
    port: parsePort('AGENT_PORT', 3001),
  },
  api: {
    port: apiPort,
    // The fallback is only for local development; deployments must set this explicitly.
    key: requireEnv('AGENT_API_KEY', 'dev-agent-api-key'),
  },
  tails: {
    directory: requireEnv('TAILS_DIRECTORY', join(homedir(), '.afj', 'tails')),
    // Verifiers and wallets use this URL later when checking revocation.
    baseUrl: withoutTrailingSlash(requireEnv('TAILS_BASE_URL', `http://localhost:${apiPort}/tails`)),
  },
  webhooks: {
    // When unset, event handlers just log and keep Credo processing moving.
    url: process.env.WEBHOOK_URL || undefined,
    // When set, webhook payloads get an X-Unify-Signature header.
    signingSecret: process.env.WEBHOOK_SIGNING_SECRET || undefined,
  },
  activations: {
    storeFile: requireEnv('ACTIVATION_STORE_FILE', join(homedir(), '.afj', 'activation-links.json')),
    // Student-facing link route used in the email sent by the Admin Portal.
    walletActivationRoute: requireEnv('WALLET_ACTIVATION_ROUTE', 'unifywallet://activate'),
    tokenTtlHours: parsePositiveInteger('ACTIVATION_TOKEN_TTL_HOURS', 24),
    issuerLabel: process.env.ACTIVATION_ISSUER_LABEL || 'UNIFY Issuer Service',
  },
  demoIssuance: {
    // Temporary fallback while the Admin Portal owns setup persistence.
    credentialDefinitionId: process.env.DEMO_CREDENTIAL_DEFINITION_ID || undefined,
    issuerLabel: process.env.DEMO_ISSUER_LABEL || 'UNIFY Issuer Service',
    ledgerName: process.env.DEMO_LEDGER_NAME || 'BCovrin Test',
  },
} as const

export type AppConfig = typeof config
