# Team TODO Handoff

This file is intentionally written for both humans and AI agents. It names the
current blocker chain, where to edit, and how to prove each task is actually
done. Keep it updated when Jira status changes.

## Current Critical Path

1. AD-68: prove the Dockerized Credo service can reach BCovrin Test.
2. AD-69: create and persist the university issuer DID.
3. AD-70: register the credential schema with the issuer DID.
4. AD-71: register the credential definition and revocation registry.
5. AD-72: create credential offer invitations for students.
6. AD-73: expose reliable per-student credential status to the Admin Portal.

The service currently starts and the REST API is reachable. That is not the
same as proving issuance. Issuance is proven only when a wallet accepts an
offer and the credential exchange reaches Credo's terminal `done` state.

## AD-68 - Ledger Connectivity

Owner in Jira: Joshua Wood.

Primary files:
- `src/agent/networks.ts`
- `src/services/statusService.ts`
- `src/agent/modules.ts`

Current repo evidence:
- `GET /api/health` can pass while ledger access is still broken.
- `GET /api/status` is the real readiness check for ledger connectivity.

Done means:
- `docker compose up --build -d` starts cleanly.
- `GET /api/health` returns `status: "ok"`.
- Authenticated `GET /api/status` returns `status: "ok"`.
- The status response has `ledger.reachable: true`.

If `/api/status` reports a pool timeout, check BCovrin availability and the
genesis transactions before changing unrelated service code.

## AD-69 - Issuer DID Creation

Owner in Jira: Joshua Wood.

Primary files:
- `src/api/routes/dids.ts`
- `src/services/didService.ts`
- `src/agent/modules.ts`

This is the main blocker for schema, credential-definition, and offer proof.
Without a real issuer DID owned by this wallet, downstream endpoints can only
be structurally tested.

Done means:
- `POST /api/dids/issuer` validates input and never logs the seed.
- The DID is registered/anchored through the Credo Indy DID registrar.
- `GET /api/dids/issuer` returns the same DID.
- The same DID survives `docker compose restart`.
- Repeating `POST /api/dids/issuer` is idempotent or returns a clear conflict;
  it must not silently create multiple issuer DIDs.

Storage decision:
Jira mentions database persistence, but this repo has no database layer. Either
use Credo/Askar wallet persistence intentionally or add an explicit storage
boundary. Do not hide ad hoc persistence in a service method.

## AD-70 - Schema Creation

Owner in Jira: Caleb V.

Primary files:
- `src/api/routes/schemas.ts`
- `src/services/schemaService.ts`

Current code calls Credo's real `registerSchema` API. It is blocked from final
proof by AD-68 and AD-69.

Done means:
- Use the DID from `GET /api/dids/issuer`.
- `POST /api/schemas` returns a real `schemaId`.
- A bad payload returns a useful 4xx error.
- A ledger failure returns a clear operational error, not an ambiguous crash.

## AD-71 - Credential Definition and Revocation Registry

Owner in Jira: Caleb V.

Primary files:
- `src/api/routes/schemas.ts`
- `src/services/schemaService.ts`
- `src/services/revocationService.ts`

Current repo behavior:
- Credential-definition creation is exposed as its own endpoint.
- Revocation-registry creation is exposed as its own endpoint.
- Jira says this should be triggered automatically after schema creation.

Decision needed:
Either keep the explicit multi-step API and update Jira/Admin Portal expectations,
or add an orchestration endpoint that creates schema, credential definition, and
revocation registry in order while reusing the existing service methods.

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
- Credential state changes are logged, but webhook dispatch is still TODO.

Done means:
- The Admin Portal can poll by `credentialExchangeId`.
- Unknown ids return a useful 404-style response.
- State transitions are documented and mapped to UI-friendly labels.
- Webhook dispatch is implemented if the Admin Portal needs real-time updates.
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

