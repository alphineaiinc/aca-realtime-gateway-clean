# Phase 2 isolated Neon staging database — read-only security audit (2026-11-21)

**Scope:** Connected Neon project `still-cell-80928176`, branch `br-lucky-surf-bcn2xj6u`, database `aca_phase2_staging`. Catalog-only SELECT queries. No writes, migrations, credential reads, role changes or production access.

## Observed
- Query session login is `aca_staging_owner`. This owner has `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`, and membership in `neon_superuser`; **not suitable as an application runtime identity**.
- Non-superuser login roles include `aca_p2_initializer_a`, `aca_p2_reader_a`, `aca_p2_reader_b`, `aca_p2_writer_a`, and `aca_phase2a_runtime_reader`. Their corresponding inherited group roles are `aca_automation_initializer`, `aca_automation_reader`, and `aca_automation_writer`; none of these application logins has `BYPASSRLS`.
- `aca_automation.correction_ledgers`: `relrowsecurity=true`, `relforcerowsecurity=true`.
- `aca_automation.correction_events`: `relrowsecurity=true`, `relforcerowsecurity=true`.
- Five ledger/event policies apply repository checks via `aca_automation.is_authorized_repository(repository_id)`; permissions separate read, write and initialize.
- `aca_automation.is_authorized_repository(bigint)` is a `SECURITY DEFINER` SQL function with pinned `search_path`, using `login_role=session_user` and the target `repository_id` in `aca_automation.repository_role_scopes`. **Role-switching via SET ROLE cannot replace session_user.**
- `aca_automation.repository_role_scopes`: `relrowsecurity=false`, `relforcerowsecurity=false`. Only `aca_phase2a_runtime_reader` and the staging owner have direct table grants according to the catalog. The runtime reader has `SELECT`; the staging owner has full privileges.

## Security interpretation and open questions
- **Positive structural evidence:** repository RLS policies are installed and forced on ledger/event tables; dedicated non-BYPASSRLS logins exist.
- **Not yet proven:** cross-repository read/write denial using actual dedicated login connections; membership/GRANT behavior under live application sessions; concurrent nonce replay; which credentials Render services actually use.
- **Important review:** `repository_role_scopes` is an authorization metadata table without RLS, readable by `aca_phase2a_runtime_reader`. This may be deliberate for a trusted metadata reader but needs an explicit data-exposure and least-privilege decision. It must not be silently classified as a protected tenant table.
- **Elevated owner:** keep `aca_staging_owner` exclusively for administration/migration; never wire it into Render application runtime.
- Neon project-level public connection blocking was not enabled in earlier inventory; network access controls remain unverified.

## Next acceptance sequence
1. Independently review whether the runtime reader needs direct `SELECT` on `repository_role_scopes`; document intended data exposure.
2. Use scoped **read-only** login-role tests, not owner-level SET ROLE, to verify repository A/B isolation without changing data.
3. Separately authorize disposable staging-only write-denial tests and rollback rehearsal if needed; no production database operations.
4. Record identity/connection provenance for staging Render services without retrieving or exposing secrets.

**Disposition:** Database structural configuration **partially verified**; repository isolation and least-privilege operational acceptance remain **NO-GO** until live role-specific tests and independent review.
