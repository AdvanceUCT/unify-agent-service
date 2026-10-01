# Validity and lifecycle rollout

Release wallet PR #83 before this agent emits CREDENTIAL_EXPIRED, CREDENTIAL_NOT_YET_VALID or CREDENTIAL_VALIDITY_INVALID. Deploy this additive agent contract before portal PR #118. Credential status exposes only signed issuance validity metadata in addition to its existing DTO, for bound portal backfill.

CREDENTIAL_VALIDITY_LEGACY_DEFINITION_IDS defaults to empty. Inventory portal schema identifiers and resolve matching agent trusted definitions against ledger schemas. Configure the same confirmed list in agent and portal. Only older schemas without both validity attributes qualify; unknown/partial schemas and supplied malformed dates never receive an exception. Modern proofs group the dates with student attributes and preserve holder consent.

Validity uses authoritative server time and validFrom <= now < expiresAt. The first terminal verification decision stays stable. Existing payment sessions keep their own authentication and refresh rules.

Lifecycle snapshots, transition responses and webhooks carry persisted revision/event identity. Historical local records migrate to revision zero without changing status. Retries of a completed action return its original identity. Scheduled reactivation may send expectedRevision; a stale revision returns 409 before a ledger operation.

The existing single-agent-process assumption remains. R06 durable event delivery and R18 recovery from ledger success followed by local persistence failure remain separate. No deployment or live data mutation is authorized by this document.
