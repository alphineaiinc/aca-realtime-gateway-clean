# Phase 2 Neon staging — live read-only privilege and role-boundary audit (2026-11-21)

**Scope:** Neon project `still-cell-80928176`, branch `br-lucky-surf-bcn2xj6u`, database `aca_phase2_staging`. Actual dedicated login sessions via `role_name`; SELECT-only queries. No data writes, role grants, credentials, service changes or production access.

## Effective table privileges
| Login | Ledger SELECT | Ledger INSERT | Ledger UPDATE | Ledger DELETE | Event INSERT | Role scopes SELECT | Role scopes UPDATE |
|---|---|---|---|---|---|---|---|
| `aca_p2_reader_a` | yes | no | no | no | no | no | no |
| `aca_p2_reader_b` | yes | no | no | no | no | no | no |
| `aca_p2_writer_a` | yes | no | yes | no | yes | no | no |
| `aca_p2_initializer_a` | yes | yes | no | no | no | no | no |
| `aca_phase2a_runtime_reader` | yes | no | no | no | no | **yes** | no |

Each session's `current_user` and `session_user` matched its login. Privileges were measured with `has_table_privilege`, not inferred solely from GRANT statements.

## Membership and repository authorization
- `aca_p2_writer_a` belongs to `aca_automation_writer`, not initializer, owner or `neon_superuser`.
- `aca_p2_initializer_a` belongs to `aca_automation_initializer`, not writer, owner or `neon_superuser`.
- `aca_p2_reader_a` and `aca_phase2a_runtime_reader` are not members of owner or `neon_superuser`.
- `has_function_privilege(..., 'aca_automation.is_authorized_repository(bigint)', 'EXECUTE')` is true for tested application roles.
- Calling `is_authorized_repository` under writer A and initializer A returned true for repository `880001`, false for `880002` and `1080201236`.
- Calling the function as runtime reader returned true only for `1080201236`, false for `880001` and `880002`.

## Security review
- **Positive:** dedicated staging logins enforce distinct effective table privileges, lack elevated owner/superuser membership, and produce repository-specific authorization outcomes.
- **Open:** `aca_phase2a_runtime_reader` has SELECT on `aca_automation.repository_role_scopes`, whose RLS is disabled. The metadata exposure should be explicitly reviewed; no grant or RLS change was made.
- **Open:** actual INSERT/UPDATE failure, event-table RLS with positive fixtures, concurrent nonce replay, default schema/function/sequence grants, SET ROLE/SET SESSION AUTHORIZATION resistance, and Render application credential mapping.
- **Open:** owner login `aca_staging_owner` is elevated (BYPASSRLS). Keep administrative identity out of runtime services.

**Disposition:** PASS for observed effective table privileges, role membership, and repository authorization function results; NO-GO for full operational staging security acceptance. Read-only observations are not equivalent to live write-denial tests.

No permission to merge, deploy, sign, provision credentials or dispatch agents is implied.
