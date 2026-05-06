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
    port: parsePort('API_PORT', 3000),
  },
  webhooks: {
    /**
     * Optional URL the Admin Portal exposes to receive credential / connection
     * state-change events. When unset, events are logged only. See
     * `src/events/` for the dispatch logic.
     */
    url: process.env.WEBHOOK_URL || undefined,
  },
} as const

export type AppConfig = typeof config
