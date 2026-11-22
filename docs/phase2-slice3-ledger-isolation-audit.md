# Phase 2 slice 3 — correction ledger and repository isolation audit

**Scope:** `automationLedgerService.js`, `postgresCorrectionLedger.js`, `aca_automation_repository_rls.sql`, `aca_automation_role_policy.sql`. Offline review only. No migration or live database connection authorized.

## Confirmed in source
- Ledger append uses a pinned client transaction, `SELECT ... FOR UPDATE`, a maximum of two corrections, sequential event numbering, head continuity, and unchanged-failure rejection.
- Missing ledger, corrupt version/event sequence, invalid UUID/SHA and exhausted budget reject before commit; exceptions attempt rollback.
- Service adapter requires a pinned client, a role check, matching repository/issue/PR context and current head. Caller-supplied `context.authenticated` is not independent identity proof.
- SQL role template separates reader/initializer/writer grants; immutable event UPDATE/DELETE grants are absent.
- Repository RLS uses `session_user` plus explicitly provisioned login-role-to-repository mappings; no mappings are seeded. RLS is forced on ledger and event tables.

## Security issues requiring attention before activation
1. **Identity boundary:** `context.authenticated` and `actorId` are caller assertions; validate against an independently authenticated GitHub identity and repository-scoped service credential.
2. **Role topology:** the RLS function uses `session_user`, while application role guard checks `current_user`. Document and test how LOGIN roles inherit or `SET ROLE` to NOLOGIN groups; reject privileged/BYPASSRLS accounts.
3. **Provisioning:** require explicit staging-only grants and repository mappings. Review `SECURITY DEFINER` ownership and execution grants; never use a shared database owner account.
4. **Ledger initialization:** verify exact GitHub head provenance before creating ledger; do not reset existing histories or initialize automatically.
5. **Error recovery:** test rollback failure, simultaneous append races, replayed event IDs, cross-repository reads/writes and transaction connection reuse under disposable PostgreSQL.
6. **Scope granularity:** RLS restricts repository IDs, not individual issue/PR ownership. Authenticate and enforce issue/PR scope at the service boundary.
7. **Product reuse:** each Alphine AI repository requires distinct allowlist, database login mapping, workflow pins and retry budget; do not reuse ACA scope implicitly.

## Acceptance criteria
All adversarial cases must fail closed in disposable SQL and later in separately approved staging with least-privilege identities. Green CI is not a production authorization. PR #27 stays unmerged; six execution authorization flags remain false.
