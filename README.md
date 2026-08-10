# UNIFY Identity Agent Service

[![Node.js](https://img.shields.io/badge/Node.js_22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express_4-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Credo](https://img.shields.io/badge/Credo_TS_0.5-2D3748?logo=hyperledger&logoColor=white)](https://credo.js.org/)
[![AnonCreds](https://img.shields.io/badge/AnonCreds-00599C?logo=hyperledger&logoColor=white)](https://hyperledger.github.io/anoncreds-spec/)
[![Indy VDR](https://img.shields.io/badge/Indy_VDR-003B57?logo=hyperledger&logoColor=white)](https://github.com/hyperledger/indy-vdr)
[![Jest](https://img.shields.io/badge/Jest_29-C21325?logo=jest&logoColor=white)](https://jestjs.io/)

The issuer and verifier backend for the UNIFY student digital credential system. It runs the Credo agent, manages university AnonCreds infrastructure, exchanges credentials with student wallets, enforces credential lifecycle changes, and makes authoritative verification decisions for the Admin and Vendor Portals.

UNIFY is a proof of concept and uses the BCovrin test ledger. It must not be treated as a production student-records system without a separate security, privacy, availability, and ledger-governance review.

## Current capabilities

| Area | What is implemented |
|---|---|
| Agent runtime | Encrypted Askar wallet, Indy VDR ledger connection, inbound/outbound HTTP transport, DIDComm connections, and graceful shutdown |
| Issuer setup | Issuer DID creation, schema registration, credential-definition registration, revocation-registry creation, and combined setup orchestration |
| Credential issuance | Single offers, partial-success batch offers, tokenized batch activation links, exchange listing, and status lookup |
| Credential lifecycle | Revocable issuance, sequential revocation-index allocation, temporary suspension, reactivation, permanent revocation, and persisted lifecycle state |
| Wallet activation | Short-lived activation tokens that hide raw out-of-band invitations; only token hashes are persisted |
| Service points | Trusted credential-definition policies, vendor service-point registration, stable public verification URLs, activation/deactivation, and session history |
| In-person verification | Dynamic per-scan proof requests, non-revocation proof requirements, rate limits, pending-session limits, and short-lived detailed results |
| Checkout verification | Server-created checkout sessions, short-lived single-use wallet claim capabilities, proof/result binding, and minimal checkout results |
| Verification decisions | Credo verification, trusted credential-definition enforcement, required-attribute checks, revocation failure mapping, expiry, and stable failure codes |
| Events and operations | Optional HMAC-signed connection, credential, lifecycle, and verification webhooks; request IDs; structured errors; health and ledger status endpoints |
| Data minimization | Capability-protected wallet results, bounded result visibility, automatic proof/OOB cleanup, and minimal terminal checkout metadata |

## Role in the UNIFY system

```text
Admin Portal / Vendor Portal
          |
          | Bearer-authenticated REST calls and signed event callbacks
          v
UNIFY Identity Agent Service
    |                 |
    | DIDComm         | ledger reads/writes and revocation checks
    v                 v
Student Wallet    BCovrin test ledger
```

- The Admin Portal owns administrator/vendor accounts, university records, issuance orchestration, delivery, and long-term business audit history.
- This service owns issuer/verifier private keys, Credo protocol exchanges, ledger interaction, revocation writes, and the final proof decision.
- The Student Wallet owns the holder's local keys and credentials and requires explicit student consent before presenting a proof.
- Vendor-facing systems do not receive the agent API key or wallet result capability. They integrate through the Admin Portal's vendor API.
- The ledger contains DIDs, schemas, credential definitions, revocation registry definitions, and status lists—not student records or presented attributes.

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | [![Node.js](https://img.shields.io/badge/Node.js_22-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript_5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) |
| HTTP API | [![Express](https://img.shields.io/badge/Express_4-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/) |
| Agent | [![Credo](https://img.shields.io/badge/Credo_TS_0.5-2D3748?style=flat-square&logo=hyperledger&logoColor=white)](https://credo.js.org/) [![Aries Askar](https://img.shields.io/badge/Aries_Askar-4B5563?style=flat-square&logo=hyperledger&logoColor=white)](https://github.com/openwallet-foundation/askar) |
| Credentials | [![AnonCreds](https://img.shields.io/badge/AnonCreds-00599C?style=flat-square&logo=hyperledger&logoColor=white)](https://hyperledger.github.io/anoncreds-spec/) [![Indy VDR](https://img.shields.io/badge/Indy_VDR-003B57?style=flat-square&logo=hyperledger&logoColor=white)](https://github.com/hyperledger/indy-vdr) |
| Testing | [![Jest](https://img.shields.io/badge/Jest_29-C21325?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io/) [![ts-jest](https://img.shields.io/badge/ts--jest_29-3178C6?style=flat-square&logo=jest&logoColor=white)](https://kulshekhar.github.io/ts-jest/) |
| Packaging | [![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/) |

## Project structure

```text
unify-agent-service/
├── genesis/                         # BCovrin Indy genesis transactions
├── src/
│   ├── agent/
│   │   ├── index.ts                 # Credo construction and HTTP transports
│   │   ├── modules.ts               # Askar, AnonCreds, Indy VDR, DID, credential, proof modules
│   │   ├── networks.ts              # Ledger namespaces and genesis configuration
│   │   └── tailsFileService.ts      # Local tails persistence and public URL mapping
│   ├── api/
│   │   ├── middleware/
│   │   │   ├── apiKeyAuth.ts        # Constant-time API bearer validation and public-route policy
│   │   │   ├── errorHandler.ts      # App/Credo error response mapping
│   │   │   ├── requestContext.ts    # Validated or generated X-Request-ID
│   │   │   └── requestLogger.ts     # Status and request-duration logging
│   │   ├── routes/
│   │   │   ├── health.ts            # Process and Credo initialization health
│   │   │   ├── status.ts            # Live Indy pool reachability status
│   │   │   ├── dids.ts              # Issuer DID lookup and creation
│   │   │   ├── schemas.ts           # Schema, cred-def, revocation-registry routes
│   │   │   ├── issuance.ts          # Combined issuer bootstrap workflow
│   │   │   ├── connections.ts       # DIDComm invitation and connection inspection
│   │   │   ├── credentials.ts       # Offers, activation links, status, lifecycle operations
│   │   │   ├── verifier.ts          # Protected trust policy, service-point, checkout, result APIs
│   │   │   ├── walletActivation.ts  # Public activation-token resolution
│   │   │   └── walletVerification.ts # Public/capability-bound wallet verification APIs
│   │   ├── server.ts                # Express composition and public tails route
│   │   └── validation.ts            # Explicit request-body validation helpers
│   ├── config/
│   │   └── index.ts                 # Environment parsing and production-secret enforcement
│   ├── events/
│   │   ├── connectionEvents.ts      # Connection state synchronization
│   │   ├── credentialEvents.ts      # Credential state and revocation metadata events
│   │   ├── proofEvents.ts           # Verification decision synchronization
│   │   └── webhookDispatcher.ts     # Optional HMAC-signed Admin Portal callbacks
│   ├── services/
│   │   ├── didService.ts            # Issuer DID creation and reuse
│   │   ├── schemaService.ts         # Schema, cred-def, revocation-registry registration
│   │   ├── issuanceSetupService.ts  # Idempotent multi-step setup orchestration
│   │   ├── credentialService.ts     # Revocable offer creation and exchange status
│   │   ├── activationLinkService.ts # Tokenized activation-link issuance
│   │   ├── walletActivationService.ts # Token resolution for the holder wallet
│   │   ├── revocationService.ts     # Suspend/reactivate/revoke ledger updates
│   │   ├── verificationService.ts   # Service points, proof sessions, decisions, cleanup
│   │   ├── verificationDecision.ts  # Deterministic terminal status/failure mapping
│   │   ├── verificationRateLimiter.ts # Per-IP and per-service-point limits
│   │   ├── *Store.ts                # Locked JSON metadata stores
│   │   └── verificationCleanup.ts   # One-minute result-retention cleanup loop
│   ├── errors.ts                    # Expected API error with status/code/details
│   └── index.ts                     # Startup, event registration, cleanup, shutdown
├── .env.example                     # Runtime configuration reference
├── docker-compose.yml               # Persistent local agent volume and ports
├── Dockerfile                       # Test/build image and unprivileged runtime image
├── package.json
└── tsconfig.json
```

Tests are colocated in `__tests__` directories beside the middleware, routes, services, events, and agent code they cover.

## API access model

The Express API is mounted under `/api`. All protected routes require:

```http
Authorization: Bearer <AGENT_API_KEY>
```

The bearer value is compared in constant time. The only unauthenticated surfaces are deliberately narrow:

| Public surface | Protection |
|---|---|
| `GET /api/health` | Returns process/agent readiness only |
| `POST /api/wallet/activation/resolve` | Requires a valid, unexpired activation capability |
| `POST /api/wallet/verification/sessions` | Requires a valid service-point public ID and client request ID; rate/pending limited |
| `POST /api/wallet/verification/sessions/:id/claim` | Requires the matching single-use checkout claim token |
| `GET /api/wallet/verification/sessions/:id` | Requires the verification-specific result bearer token |
| `GET /tails/*` | Public because holders and verifiers need tails files for revocation proofs |

Do not expose `AGENT_API_KEY` to a browser, vendor integration, QR code, or mobile application.

## Local setup

### Prerequisites

- Git
- Docker Desktop with Linux containers
- Node.js 20 or later; CI and the container build use Node.js 22
- npm

### 1. Install and configure

```powershell
git clone https://github.com/AdvanceUCT/unify-agent-service.git
Set-Location unify-agent-service
npm install
Copy-Item .env.example .env
```

Replace all development secrets before running anywhere shared or public.

### 2. Important environment variables

| Variable | Purpose |
|---|---|
| `AGENT_NAME` | Human-readable issuer/verifier label shown in DIDComm interactions |
| `AGENT_WALLET_ID`, `AGENT_WALLET_KEY` | Encrypted Askar wallet identifier and key |
| `AGENT_ENDPOINT`, `AGENT_PORT` | Public DIDComm endpoint and inbound HTTP port |
| `API_PORT` | Internal REST API port used by the Admin Portal |
| `AGENT_API_KEY` | Shared server-to-server bearer token |
| `TAILS_DIRECTORY`, `TAILS_BASE_URL` | Persistent tails storage and wallet/verifier-accessible public URL |
| `VERIFIER_TRUSTED_CREDENTIAL_DEFINITION_IDS` | Optional comma-separated trust-policy bootstrap list |
| `VERIFICATION_PUBLIC_BASE_URL` | Admin Portal origin used to build printable verification links |
| `VERIFICATION_STORE_FILE` | Persistent service-point, trust-policy, and session metadata file |
| `VERIFICATION_SESSION_TTL_MINUTES` | Time allowed to complete or claim a proof request; default `5` |
| `VERIFICATION_RESULT_VISIBILITY_MINUTES` | Detailed-result retention before proof cleanup; default `15` |
| `VERIFICATION_RESULT_TOKEN_SECRET` | HMAC key for wallet result and checkout claim capabilities |
| `VERIFICATION_RATE_LIMIT_PER_IP` | Per-IP session-start limit |
| `VERIFICATION_RATE_LIMIT_PER_SERVICE_POINT` | Per-service-point session-start limit |
| `VERIFICATION_MAX_PENDING_PER_SERVICE_POINT` | Maximum concurrent pending sessions per service point |
| `ACTIVATION_STORE_FILE`, `ACTIVATION_TOKEN_TTL_HOURS` | Activation metadata and token lifetime; default `24` hours |
| `WALLET_ACTIVATION_ROUTE` | Student-facing activation link base, normally `unifywallet://activate` |
| `CREDENTIAL_LIFECYCLE_STORE_FILE` | Business distinction between active, suspended, and permanently revoked |
| `REVOCATION_INDEX_STORE_FILE` | Next unused AnonCreds revocation index by registry |
| `WEBHOOK_URL`, `WEBHOOK_SIGNING_SECRET` | Admin Portal event receiver and optional HMAC signing secret |

See [.env.example](./.env.example) for defaults and operational notes. In `NODE_ENV=production`, startup fails if the wallet key, API key, or verification token secret is missing or still uses its development fallback.

### 3. Start with Docker

```powershell
docker compose up --build
```

With the supplied `.env.example` values:

- REST API: `http://localhost:3002`
- DIDComm inbound transport: `http://localhost:3001`
- Public tails base: `http://localhost:3002/tails`

`AGENT_ENDPOINT` must be reachable by a real student wallet. A phone cannot connect to a container-only or host-only `localhost` address.

Check process health:

```powershell
Invoke-RestMethod http://localhost:3002/api/health
```

Check agent and ledger health with the API key:

```powershell
$headers = @{ Authorization = "Bearer $env:AGENT_API_KEY" }
Invoke-RestMethod http://localhost:3002/api/status -Headers $headers
```

### Run without Docker

Native Credo dependencies must be available for the host platform.

```powershell
npm run dev
```

For production-style execution:

```powershell
npm run build
npm start
```

## API summary

Except for the public routes listed earlier, these endpoints require the agent bearer token.

| Method and path | Purpose |
|---|---|
| `GET /api/health` | Process and Credo initialization health |
| `GET /api/status` | Agent plus live Indy pool reachability status |
| `GET/POST /api/dids/issuer` | Read or create the issuer DID |
| `POST /api/issuance/setup` | Register schema, cred-def, and optional revocation registry together |
| `POST /api/schemas` | Register an AnonCreds schema |
| `POST /api/credential-definitions` | Register a credential definition |
| `POST /api/credential-definitions/:cdId/revocation-registries` | Register a revocation registry and tails data |
| `POST /api/connections/invitations` | Create a DIDComm out-of-band connection invitation |
| `GET /api/connections` | List current Credo connection records |
| `POST /api/credentials/offers` | Create one credential offer invitation |
| `POST /api/credentials/offers/batch` | Create offers with per-student success/failure results |
| `POST /api/credentials/activation-links/batch` | Create tokenized student activation links |
| `GET /api/credentials` | List credential exchanges, optionally filtered by state |
| `GET /api/credentials/:id` | Read a normalized credential-exchange status |
| `GET /api/credentials/:id/lifecycle` | Read active/suspended/revoked business state |
| `POST /api/credentials/:id/suspend` | Temporarily mark the credential index revoked on-ledger |
| `POST /api/credentials/:id/reactivate` | Restore only a suspended credential index |
| `POST /api/credentials/:id/revoke` | Permanently revoke a credential |
| `GET/POST /api/verifier/credential-definitions` | List or register trusted verification policies |
| `GET/POST /api/verifier/service-points` | List or create vendor service points |
| `GET/PATCH /api/verifier/service-points/:id` | Read, rename, reconfigure, activate, or deactivate a service point |
| `GET /api/verifier/service-points/:id/sessions` | List recent bounded verification status for a service point |
| `POST /api/verifier/checkout-sessions` | Create an unclaimed checkout-bound verification request |
| `GET /api/verifier/proof-requests/:id` | Protected authoritative result/status |
| `GET /api/verifier/proof-requests/:id/details` | Protected short-lived in-person result attributes |

## Issuance and lifecycle

### University setup

`POST /api/issuance/setup` coordinates the schema, credential definition, and optional revocation registry. The lower-level schema endpoints remain available for targeted retries. Issuer DID seed material is generated inside the service and is never accepted in an API request.

### Offers and activation

For revocable issuance, the service reserves the next unused index for the selected registry and includes the resulting revocation metadata in credential events. Batch issuance returns item-level failures rather than discarding successful offers.

Activation links replace raw out-of-band invitations with random short-lived tokens. The service persists a SHA-256 hash of each token alongside its invitation and expiry. The wallet resolves the token through the public activation route, then receives the actual invitation needed by Credo.

### Suspension and revocation

AnonCreds represents both suspension and permanent revocation through the revocation status list, so the JSON lifecycle store preserves their business distinction:

- `suspend` revokes the index on-ledger but allows a later reactivation.
- `reactivate` is valid only for a suspended credential and restores the index.
- `revoke` is permanent; a revoked credential cannot return to an active state.

Each successful change emits a `credential.lifecycleChanged` event with the registry, credential index, previous/new status, timestamp, and optional reason.

## Verification flows

### Trust policy

Before creating service points, register at least one trusted credential definition or provide bootstrap IDs through `VERIFIER_TRUSTED_CREDENTIAL_DEFINITION_IDS`. Registration resolves the credential definition and schema from the ledger, rejects definitions without revocation support, and stores the schema attributes as the proof policy. A service point is bound to a specific active trusted definition.

### Static service-point verification

1. The Admin Portal creates a service point through `POST /api/verifier/service-points`.
2. The returned `/verify/{publicServicePointId}` URL is stable and may be printed as a QR code.
3. Each wallet scan calls `POST /api/wallet/verification/sessions` with a new client request ID.
4. The agent rate-limits the request, creates a new five-minute Credo proof exchange, and returns an invitation plus a result capability.
5. The wallet displays the verifier and all schema attributes requested by that service point before asking for consent.
6. Protected verifier endpoints may show disclosed attributes for the configured visibility window; cleanup then deletes the Credo proof and OOB records.

The static QR identifies the service point only. It never contains reusable proof material or a completed verification result.

### Checkout verification

1. The Admin Portal creates a session with vendor ID, internal service-point ID, and checkout ID.
2. The returned URL contains a deterministic, short-lived claim capability bound to that verification request.
3. The wallet claims it exactly once through `POST /api/wallet/verification/sessions/:id/claim`.
4. Only a successful claim creates the Credo proof exchange and result capability.
5. The portal polls the protected verifier result or consumes the signed `verification.completed` webhook.
6. Vendor-facing results remain minimal: request/checkout identifiers, status, failure code, and timestamps.

Expired, malformed, mismatched, or reused claims are rejected. A checkout session cannot be used as an unclaimed static verification request.

### Decision rules

A verification is approved only when:

- Credo reports the proof as cryptographically verified;
- every credential definition in the presentation matches the service point's trusted definition;
- every schema attribute required by the policy is present; and
- the proof satisfies a current non-revocation interval.

Terminal outcomes are normalized to `Approved`, `Declined`, `Expired`, or `Failed` with stable failure codes for untrusted credentials, missing attributes, non-current credentials, revocation-check failures, proof rejection, protocol errors, abandonment, and expiry.

## Events and webhooks

When `WEBHOOK_URL` is configured, the service emits:

- `connection.stateChanged`
- `credential.stateChanged`
- `credential.lifecycleChanged`
- `verification.completed`

If `WEBHOOK_SIGNING_SECRET` is set, the JSON body is signed as `X-Unify-Signature: sha256=<hex-hmac>`. Each request includes an `X-Request-ID`; lifecycle events carry a unique event ID and verification events carry a deterministic request/completion event ID for idempotent portal handling. Delivery failures are logged without stopping Credo event processing.

## Persistence and reset

This service does not use PostgreSQL or Prisma. Credo stores encrypted wallet/key/protocol data in Askar, while small operational metadata stores use locked JSON files.

The Docker `agent-data` volume mounts `/home/node/.afj`, covering:

- the encrypted Askar wallet and Credo cache;
- tails files;
- activation-token metadata;
- verification trust policies, service points, and sessions;
- credential lifecycle state; and
- revocation index allocation.

To inspect logs:

```powershell
docker compose logs --tail=200 -f agent
```

Do not run `docker compose down -v` during ordinary troubleshooting. It permanently deletes local issuer keys, DID/wallet state, activation/session metadata, lifecycle records, and revocation-index allocation. Use it only when intentionally rebuilding the entire local identity environment from scratch.

## Commands and CI

```powershell
npm run dev                   # Run TypeScript directly with ts-node
npm run typecheck             # Type-check without emitting
npm test                      # Run the Jest suite
npm test -- --runInBand       # Run Jest serially for debugging
npm run build                 # Compile src/ to dist/
npm start                     # Run dist/index.js
docker compose up --build     # Test, build, and run the container
```

The Docker builder runs the full Jest suite before compiling. GitHub Actions uses Node.js 22: CI installs from `package-lock.json`, runs type checking and Jest, while the build workflow separately compiles the service. Version tags matching `v*.*.*` create GitHub release notes.

Before opening a pull request, run:

```powershell
npm run typecheck
npm test -- --runInBand
npm run build
```

## Security notes

- Never commit `.env`, wallet keys, agent API keys, webhook secrets, token secrets, or production ledger material.
- Keep the protected REST API private to trusted portal services; only the explicitly public health, wallet, and tails routes should be internet-accessible.
- Use unrelated high-entropy values for `AGENT_WALLET_KEY`, `AGENT_API_KEY`, `VERIFICATION_RESULT_TOKEN_SECRET`, and `WEBHOOK_SIGNING_SECRET`.
- Verification trust remains backend-owned. Do not accept client-supplied proof decisions or credential-definition allowlists.
- Keep the agent-data volume backed up and access-controlled. Losing it can strand issuer keys and invalidate operational mappings.
- Serve deployed DIDComm, verification, and tails URLs over HTTPS through the intended reverse proxy.
