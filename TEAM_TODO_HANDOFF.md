# Team TODO Handoff

This file is intentionally written for both humans and AI agents. It names the
current blocker chain, where to edit, and how to prove each task is actually
done. Keep it updated when Jira status changes.

## Code Comment Map

Use this section when deciding where to continue implementation:

- `src/services/didService.ts` documents what is complete for AD-69 and marks
  the BCovrin self-registration code as PoC-only.
- `src/services/schemaService.ts` owns AD-70 and the low-level pieces of AD-71:
  schema, credential-definition, revocation-registry, and status-list writes.
- `src/services/issuanceSetupService.ts` is the Admin Portal orchestration
  layer for AD-70/AD-71. Its comments explain partial-success behavior and why
  retries must not create duplicate ledger objects.
- `src/agent/tailsFileService.ts` explains how revocation tails files are
  copied and served today, plus the production storage gap.
- `src/services/credentialService.ts` owns AD-72 offer creation and AD-73
  status DTOs. Comments call out that Admin Portal persistence is still
  required for `externalId`/`email` to `credentialExchangeId` correlation.
- `src/events/` marks the webhook implementation gap for real-time Admin
  Portal updates.
- `src/api/middleware/apiKeyAuth.ts`, `src/config/index.ts`, and
  `src/api/validation.ts` document AD-75 auth/config/validation hardening.

## Current Critical Path

1. ~~AD-68: prove the Dockerized Credo service can reach BCovrin Test.~~ **DONE**
2. ~~AD-69: create and persist the university issuer DID.~~ **DONE**
3. AD-70: register the credential schema with the issuer DID.
4. AD-71: register the credential definition and revocation registry. ← **current blocker**
5. AD-72: create credential offer invitations for students.
6. AD-73: expose reliable per-student credential status to the Admin Portal.

AD-68 and AD-69 are proven complete as of 2026-05-07. The ledger is reachable
and the issuer DID is anchored on BCovrin Test and persisted in the Askar
wallet. AD-70 is now unblocked — Caleb can call `POST /api/schemas` using the
DID returned from `GET /api/dids/issuer` against a running container.

Issuance is proven only when a wallet accepts an offer and the credential
exchange reaches Credo's terminal `done` state.

## AD-68 - Ledger Connectivity — DONE

Owner in Jira: Joshua Wood. Completed 2026-05-07.

Root cause was a stale genesis: `networks.ts` only contained the Node1
transaction (138.197.138.255) which was decommissioned in seqNo:11 of the
live ledger. The active validators are now BCovrin01–04 at 130.107.207.129.

Resolution:
- Genesis transactions moved out of source code into `genesis/bcorvin-test.txn`
  (14 transactions, one JSON object per line).
- `src/agent/networks.ts` now reads that file at runtime via `fs.readFileSync`
  anchored to `__dirname` so it resolves correctly from the compiled output.
- `Dockerfile` copies `genesis/` into both builder and runner stages.
- To update the genesis in future: edit `genesis/bcorvin-test.txn` and rebuild.
  Do not re-embed genesis as a TypeScript string.

Proof: authenticated `GET /api/status` returns `ledger.reachable: true`.

## AD-69 - Issuer DID Creation — DONE

Owner in Jira: Joshua Wood. Completed 2026-05-07.

Primary files:
- `src/api/routes/dids.ts`
- `src/services/didService.ts`
- `src/services/__tests__/didService.test.ts` (new)

What was implemented:
- `POST /api/dids/issuer` — accepts `{ alias?: string }`. Seed is generated
  server-side via `crypto.randomBytes`; it is never accepted from the caller,
  never logged, and never returned. Registers on BCovrin Test with role
  `ENDORSER`, then imports into the Credo/Askar wallet via `agent.dids.import`.
  Returns `{ did: "did:indy:bcovrin:test:<22-chars>" }` on 201.
- `GET /api/dids/issuer` — returns the persisted DID (200) or 404 if not yet
  created.
- Second `POST` returns 409 with the existing DID in the body.
- 10 unit tests added covering happy path, 409, 502 (network error), 502
  (BCovrin non-200), null wallet, and multi-DID wallet guard.
- Tests run in the Dockerfile builder stage (`RUN npm test` before
  `RUN npm run build`) — a failing test blocks the image build.

Storage decision resolved: DID and private key are persisted in the Credo/Askar
encrypted wallet volume (`agent-data`). No separate database layer is used.
The wallet volume survives `docker compose restart` but not `docker compose
down -v` — document this as a known PoC limitation.

For production: replace BCovrin self-registration with an endorser-signed NYM
transaction (Sovrin MainNet) or the Cheqd flow. A `TODO(production)` comment
is in `createIssuerDid()` as a marker.

Proof: `POST /api/dids/issuer` → 201 with `did:indy:bcovrin:test:` DID.
`GET /api/dids/issuer` → same DID. Second POST → 409. All 10 tests pass.

## AD-70 - Schema Creation

Owner in Jira: Caleb V.

Primary files:
- `src/api/routes/schemas.ts`
- `src/services/schemaService.ts`

AD-68 and AD-69 are now complete. This ticket is unblocked.

To get the issuer DID to use as `issuerDid` in the request body:
```
GET /api/dids/issuer  →  { did: "did:indy:bcovrin:test:..." }
```

Current code calls Credo's real `registerSchema` API and is structurally
complete. It needs a live ledger connection and a real issuer DID to be proven
end-to-end — both of which now exist.

Done means:
- Use the DID from `GET /api/dids/issuer` as the `issuerDid` field.
- `POST /api/schemas` returns a real `schemaId`.
- A bad payload returns a useful 4xx error.
- A ledger failure returns a clear operational error, not an ambiguous crash.

## AD-71 - Credential Definition and Revocation Registry

Owner in Jira: Caleb V.

Primary files:
- `src/api/routes/schemas.ts`
- `src/api/routes/issuance.ts`
- `src/services/schemaService.ts`
- `src/services/revocationService.ts`
- `src/services/issuanceSetupService.ts`
- `src/agent/tailsFileService.ts`

Current repo behavior:
- Credential-definition creation is exposed as its own endpoint.
- Revocation-registry creation is exposed as its own endpoint.
- `POST /api/issuance/setup` creates schema and credential definition in one
  Admin Portal friendly call, with optional revocation registry setup.
- Revocation tails files are published from `/tails/:tailsHash`.

Decision resolved:
Keep the lower-level endpoints for debugging/retry and use
`POST /api/issuance/setup` as the Admin Portal contract. Revocation is optional
for the first issuance path, but AD-71 is only complete when the revocation path
returns a real registry definition and status-list timestamp.

Done means:
- A real `credentialDefinitionId` is returned.
- If revocation is enabled, a real `revocationRegistryDefinitionId` and status
  list timestamp are returned.
- The endpoint behavior matches the Admin Portal contract.

## AD-72 - Credential Offer Deep Links

Owner in Jira: Caleb V.

Primary files:
- `src/api/routes/credentials.ts`
- `src/services/credentialService.ts`

Current code can create single and batch offer invitations once a real
`credentialDefinitionId` exists.

Done means:
- Batch input validates each student record.
- Each successful student gets an `invitationUrl` and `credentialExchangeId`.
- Failures are returned per student without failing the whole batch.
- At least one invitation is opened by the student wallet and reaches `done`.

Important integration note:
The current service returns `externalId` and `email` in the response but does
not persist them. The Admin Portal must store the returned
`credentialExchangeId` immediately, or this service needs an explicit storage
module.

## AD-73 - Credential Status

Owner in Jira: Lusanele.

Primary files:
- `src/api/routes/credentials.ts`
- `src/services/credentialService.ts`
- `src/events/credentialEvents.ts`

Current repo behavior:
- `GET /api/credentials` lists Credo credential exchange records.
- `GET /api/credentials/:id` returns basic state for one exchange.
- Credential state changes are logged and optionally dispatched to `WEBHOOK_URL`.

Done means:
- The Admin Portal can poll by `credentialExchangeId`.
- Unknown ids return a useful 404-style response.
- State transitions are documented and mapped to UI-friendly labels.
- Admin Portal webhook consumption is implemented if real-time updates are needed.
- A full wallet acceptance test shows state moving to `done`.

## AD-75 - API Key Auth

Owner in Jira: Caleb V.

Primary files:
- `src/api/middleware/apiKeyAuth.ts`
- `src/api/server.ts`
- `src/config/index.ts`

Current code mounts auth for all `/api` routes except `/api/health`.

Done means:
- Missing token returns 401.
- Wrong token returns 401.
- Correct token can call protected routes.
- `.env` or deployment config sets `AGENT_API_KEY`; production-like runs must
  not rely on `dev-agent-api-key`.

