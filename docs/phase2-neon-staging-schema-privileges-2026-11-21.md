# Phase 2 staging — schema, function and sequence privilege audit (2026-11-21)

**Scope:** Read-only catalog and `has_*_privilege` queries against Neon project `still-cell-80928176`, branch `br-lucky-surf-bcn2xj6u`, database `aca_phase2_staging`. No DDL, writes, secrets, role modifications or production access.

## Findings
1. All five actual login roles (`aca_p2_reader_a`, `aca_p2_reader_b`, `aca_p2_writer_a`, `aca_p2_initializer_a`, `aca_phase2a_runtime_reader`) have USAGE but **not CREATE** on both `aca_automation` and `public`.
2. Reader A, writer A, initializer A and runtime reader have no database CREATE permission, but do have TEMP permission. Temporary-object privileges merit explicit threat-model review; TEMP is not equivalent to schema CREATE.
3. `aca_automation.is_authorized_repository(bigint)` is owned by `aca_staging_owner`, `SECURITY DEFINER`, and has explicit EXECUTE ACL entries for the initializer, reader and writer group roles. Its definition uses `session_user` and a pinned search path, as documented in the preceding role audit.
4. `aca_automation.reject_correction_event_mutation()` is a `SECURITY INVOKER` trigger function. Its body only raises `correction_events_are_immutable`; `proacl` is NULL, so PostgreSQL default function EXECUTE privileges apply. `has_function_privilege` returns true for the four sampled application logins. This is a permission-hardening review item, **not** a demonstrated mutation bypass.
5. No user-schema sequences were returned by the catalog query.

## Proposed safe next test (NOT executed)
Use a disposable, isolated staging-only transaction under the dedicated `aca_p2_writer_a` and `aca_p2_initializer_a` logins. Before any writes, independently confirm a non-production branch and known test repository fixtures. In each role session, `BEGIN`; attempt unauthorized cross-repository INSERT/UPDATE or event mutation; verify SQLSTATE and zero persisted changes; `ROLLBACK`. Do not infer denial from `has_table_privilege` alone. For event isolation, create positive and negative fixture rows only under separately approved staging-only setup and tear down. Avoid owner-level `SET ROLE` as a substitute for independent login authentication.

## Outstanding review decisions
- Whether direct runtime reader SELECT on non-RLS `repository_role_scopes` is required; minimize exposure if not.
- Whether default EXECUTE on the rejection trigger function and database TEMP privileges should be restricted.
- Validate function ownership, SECURITY DEFINER search path and GRANT lifecycle in migrations and incident rollback.
- Real staging connection-string identities and network isolation remain unverified.

**Disposition:** PASS for observed schema CREATE restrictions and absence of user sequences. NO-GO for complete staging write isolation until transactional tests and independent review.
