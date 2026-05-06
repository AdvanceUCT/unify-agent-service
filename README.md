# Unify — Identity Agent Service

Backend service that runs the university's Credo-TS identity agent. Responsible
for all interactions with the public Indy ledger and all credential issuance
logic. Exposes a REST API consumed only by the Admin Portal.

See `docs-local/ids-project-context.md` for the full system context.

## Stack

- **Runtime**: Node.js 22 LTS (Linux, inside Docker)
- **Language**: TypeScript 5.6 (CommonJS output)
- **SSI framework**: [Credo-TS](https://credo.js.org/) `^0.5.13`
- **Wallet / KMS**: [Aries Askar](https://github.com/hyperledger/aries-askar) via `@hyperledger/aries-askar-nodejs`
- **Credential format**: [AnonCreds](https://hyperledger.github.io/anoncreds-spec/) via `@hyperledger/anoncreds-nodejs`
- **Ledger client**: [Indy VDR](https://github.com/hyperledger/indy-vdr) via `@hyperledger/indy-vdr-nodejs` (default network: BCovrin Test)
- **HTTP API**: Express 4

## Why these versions

Credo `0.5.x` is the last CommonJS-based release line; from `0.6.0` onwards
the framework is ESM-only, which would force the entire service (and any
team-developed code) onto ESM with `.js` extensions in TypeScript imports.
For a scaffolded handoff that's avoidable churn, so we pin to the latest
`0.5.x`. The native bindings (askar/anoncreds/indy-vdr at `0.2.x`) are
matched to that line.

The native packages depend on `@2060.io/ffi-napi` (a Node 18+ compatible fork
of the unmaintained `ffi-napi`). Under no circumstances add an `overrides`
entry that aliases `@2060.io/ffi-napi` to anything else — that was the source
of the original `(0, ffi_napi_1.Callback) is not a function` startup error.

The `overrides` block in `package.json` *does* pin the three Hyperledger
`*-shared` packages to single versions. This is required: each native binding
package (`anoncreds-nodejs`, `aries-askar-nodejs`, `indy-vdr-nodejs`) declares
its `*-shared` peer at an exact version, while `@credo-ts/*` peer-deps a
range. Without the override npm installs both, and TypeScript then sees two
distinct nominal `Anoncreds`/`Askar`/`IndyVdr` types and refuses to build with
"Types have separate declarations of a private property `_handle`" errors.
If you bump any native binding version, bump the matching `*-shared` override
to the same version.

## Local development

This service is intended to run **only inside Docker** during development.
The native bindings (`ffi-napi`, askar's `.so`) compile cleanly on Linux but
are painful on Windows; running everything inside the bookworm-slim base image
sidesteps all of that.

```bash
# from the repo root
cp .env.example .env       # then edit AGENT_WALLET_KEY to a strong secret
docker compose up --build
```

When the container is healthy you should see:

```
[agent] initialised — label="university-identity-agent"
[api]   listening on http://0.0.0.0:3000
[didcomm] inbound transport on http://0.0.0.0:3001
```

Smoke-test the API:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","agentLabel":"university-identity-agent","isInitialized":true}
```

The encrypted Askar wallet is persisted in the named volume `agent-data`,
mounted at `/home/node/.afj` inside the container. To reset wallet state:

```bash
docker compose down -v
```

## Project layout

```
src/
├── index.ts                   Boot: load config → init agent → register events → start API
│
├── config/
│   └── index.ts               Env-driven config with validation
│
├── agent/                     Everything Credo-specific lives here
│   ├── index.ts               · Public exports for the rest of the app
│   ├── agent.ts               · createAgent() factory
│   ├── modules.ts             · Module composition (askar, anoncreds, indy-vdr,
│   │                              connections, credentials, proofs, dids)
│   ├── networks.ts            · Indy ledger network configurations
│   └── types.ts               · UniversityAgent / AgentModules type aliases
│
├── events/                    Subscribe to agent events; forward to webhooks/logs
│   ├── index.ts               · registerAgentEventHandlers(agent)
│   ├── connectionEvents.ts    · ConnectionStateChanged listener
│   └── credentialEvents.ts    · CredentialStateChanged listener
│
├── services/                  Business logic — wraps Credo APIs into use-case methods
│   ├── didService.ts          · Issuer DID lifecycle
│   ├── schemaService.ts       · Schema + credential definition + revocation registry
│   ├── connectionService.ts   · OOB invitations + connection list
│   ├── credentialService.ts   · Credential offers, status, list
│   └── revocationService.ts   · Credential revocation
│
└── api/                       HTTP layer — Express, only knows about services
    ├── server.ts              · createApiServer(agent) → Express app
    ├── middleware/
    │   ├── asyncHandler.ts    · Forward async route errors to errorHandler
    │   ├── errorHandler.ts    · Centralised error → JSON 4xx/5xx response
    │   └── requestLogger.ts   · Per-request method/path/duration logging
    └── routes/
        ├── index.ts           · Mount sub-routers under /api
        ├── health.ts          · GET /api/health  (implemented)
        ├── dids.ts            · /api/dids/issuer (stub)
        ├── schemas.ts         · /api/schemas, /api/credential-definitions (stub)
        ├── connections.ts     · /api/connections, /api/connections/invitations (stub)
        └── credentials.ts     · /api/credentials, /api/credentials/:id, /revoke (stub)
```

### How to add a new endpoint

1. Add a method to the relevant service in `src/services/` (this is where the
   Credo API call goes — service files have the exact `agent.modules.X` calls
   you need in their JSDoc TODOs)
2. Add the route handler in the matching `src/api/routes/` file. Routes never
   import from `@credo-ts/*` directly — only from `../../services/*`
3. If the operation produces a state change worth surfacing to the Admin
   Portal, add a webhook payload in the relevant `src/events/*` listener

This separation means each layer has one job:
- **Routes**: parse HTTP, validate input, return JSON
- **Services**: speak fluent Credo
- **Events**: observe + forward, never drive

## Endpoint inventory

| Method | Path                                                      | Purpose                              |
| ------ | --------------------------------------------------------- | ------------------------------------ |
| GET    | `/api/health`                                             | Liveness probe (implemented)         |
| GET    | `/api/dids/issuer`                                        | Get the university's issuer DID      |
| POST   | `/api/dids/issuer`                                        | Create the issuer DID (one-time)     |
| POST   | `/api/schemas`                                            | Anchor a credential schema on Indy   |
| POST   | `/api/credential-definitions`                             | Anchor a credential definition       |
| POST   | `/api/credential-definitions/:cdId/revocation-registries` | Set up revocation                    |
| POST   | `/api/connections/invitations`                            | Create an OOB invitation             |
| GET    | `/api/connections`                                        | List active DIDComm connections      |
| POST   | `/api/credentials/offers`                                 | Create + email-ready credential offer |
| GET    | `/api/credentials`                                        | List credential exchanges            |
| GET    | `/api/credentials/:id`                                    | Get exchange status                  |
| POST   | `/api/credentials/:id/revoke`                             | Revoke an issued credential          |

Stubs throw `Error('Not implemented: …')` so a `curl` against an unimplemented
route returns 500 with a clear pointer rather than mysterious silence.

## Environment variables

See `.env.example`. All values have dev-friendly defaults except `AGENT_WALLET_KEY`,
which must be replaced with a high-entropy secret in any non-local environment.

| Variable             | Purpose                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `AGENT_NAME`         | Human-readable agent label (surfaces in DIDComm handshakes)              |
| `AGENT_WALLET_ID`    | Logical wallet identifier used by Askar                                  |
| `AGENT_WALLET_KEY`   | Passphrase that derives the Askar master key                             |
| `AGENT_ENDPOINT`     | Public DIDComm endpoint advertised in OOB invitations                    |
| `AGENT_PORT`         | Port the inbound HTTP DIDComm transport binds to                         |
| `API_PORT`           | Port the Express REST API binds to                                       |
| `WEBHOOK_URL`        | (optional) Admin Portal endpoint to receive state-change events          |

## What's implemented vs. what's left

Implemented as part of the scaffold:
- Credo agent fully wired with Askar (storage), AnonCreds, Indy VDR (BCovrin),
  Connections, Credentials, Proofs, and DIDs modules — including auto-accept
  on connections + credentials so the wallet handshake / issuance flow runs
  end-to-end without manual intervention on the issuer side
- Inbound HTTP DIDComm transport + outbound HTTP/WS transports
- Express REST API with route → service → agent layering, request logging,
  and centralised error handling
- Event listeners for connection + credential state changes (currently log
  to stdout; webhook dispatch is a single TODO marker per file)
- Graceful shutdown that closes the agent (flushes wallet writes, disconnects
  ledger pool)
- Docker-only dev workflow with persistent wallet volume

To be implemented by the team (every stub method in `src/services/` and
every route handler in `src/api/routes/` carries a `TODO(team)` block with
the specific Credo API call(s) needed):
- Issuer DID creation + lookup (`DidService`)
- Schema, credential-definition, and revocation-registry registration (`SchemaService`)
- OOB invitation creation + connection listing (`ConnectionService`)
- Credential offer creation, status lookup, and listing (`CredentialService`)
- Credential revocation (`RevocationService`)
- Webhook dispatch to the Admin Portal (`events/connectionEvents.ts`,
  `events/credentialEvents.ts`)
- Input validation on routes (currently `// TODO(team): validate body` markers — pick zod, class-validator, or your preferred library)
- Authentication on the REST API (currently un-gated; the Admin Portal is the only intended consumer)
