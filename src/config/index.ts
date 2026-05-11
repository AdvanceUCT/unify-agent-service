import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Centralised configuration for the Identity Agent Service.
 *
 * All values are read from environment variables with sensible development
 * defaults. The `.env` file at the repo root is loaded automatically by
 * docker-compose when the container starts.
 *
 * Anything secret (wallet key, DID seeds, webhook signing keys) MUST come
 * from the environment in production — never hard-coded here.
 */

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
    /** Human-readable label that surfaces in DIDComm handshakes and logs. */
    label: requireEnv('AGENT_NAME', 'university-identity-agent'),
    /** Logical wallet identifier used by Askar for the encrypted SQLite store. */
    walletId: requireEnv('AGENT_WALLET_ID', 'university-agent-wallet'),
    /**
     * Passphrase that derives the Askar master key (Argon2I by default).
     * Must be high-entropy in production. Default is unsafe and only suitable
     * for local development.
     */
    walletKey: requireEnv('AGENT_WALLET_KEY', 'change-this-to-a-secure-key'),
    /** Public DIDComm endpoint advertised in OOB invitations and DID docs. */
    endpoint: requireEnv('AGENT_ENDPOINT', 'http://localhost:3001'),
    /** Port the inbound HTTP DIDComm transport binds to. */
    port: parsePort('AGENT_PORT', 3001),
  },
  api: {
    /** Port the Express REST API (consumed by the Admin Portal) binds to. */
    port: apiPort,
    /** Shared bearer token expected from the Admin Portal. */
    // TODO(AD-75 hardening):
    // The fallback is for local-only developer convenience. For demos, staging,
    // and production, set AGENT_API_KEY explicitly in the environment and keep
    // the same value in the Admin Portal. If this falls back to
    // `dev-agent-api-key`, auth is wired but not operationally secure.
    key: requireEnv('AGENT_API_KEY', 'dev-agent-api-key'),
  },
  tails: {
    /** Local directory where issuer-created AnonCreds tails files are stored. */
    directory: requireEnv('TAILS_DIRECTORY', join(homedir(), '.afj', 'tails')),
    /** Public base URL verifiers/holders can use to download tails files. */
    baseUrl: withoutTrailingSlash(requireEnv('TAILS_BASE_URL', `http://localhost:${apiPort}/tails`)),
  },
  webhooks: {
    /**
     * Optional URL the Admin Portal exposes to receive credential / connection
     * state-change events. When unset, events are logged only. See
     * `src/events/` for the dispatch logic.
     */
    url: process.env.WEBHOOK_URL || undefined,
    /**
     * Optional HMAC secret used to sign webhook payloads. When set, webhook
     * requests include `X-Unify-Signature: sha256=<hex>`.
     */
    signingSecret: process.env.WEBHOOK_SIGNING_SECRET || undefined,
  },
  activations: {
    /** Where tokenized wallet activation records are persisted. */
    storeFile: requireEnv('ACTIVATION_STORE_FILE', join(homedir(), '.afj', 'activation-links.json')),
    /** Student-facing deep-link route used by the Admin Portal email. */
    walletActivationRoute: requireEnv('WALLET_ACTIVATION_ROUTE', 'unifywallet://activate'),
    /** How long tokenized credential links remain usable. */
    tokenTtlHours: parsePositiveInteger('ACTIVATION_TOKEN_TTL_HOURS', 24),
    issuerLabel: process.env.ACTIVATION_ISSUER_LABEL || 'UNIFY Issuer Service',
  },
  demoIssuance: {
    /**
     * Credential definition used by the wallet activation endpoint until the
     * Admin Portal persists and supplies setup state directly.
     */
    credentialDefinitionId: process.env.DEMO_CREDENTIAL_DEFINITION_ID || undefined,
    issuerLabel: process.env.DEMO_ISSUER_LABEL || 'UNIFY Issuer Service',
    ledgerName: process.env.DEMO_LEDGER_NAME || 'BCovrin Test',
  },
} as const

export type AppConfig = typeof config
