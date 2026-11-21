# Phase 2 isolated staging — authorized transactional write-denial evidence (2026-11-21)

**Owner authorization:** Explicitly authorized isolated staging-only transactional write-denial tests with dedicated application roles, disposable fixtures and rollback; prohibited production modification, merges, deployments, signing and agent dispatch.

**Actual target:** Neon project `still-cell-80928176`, branch `br-lucky-surf-bcn2xj6u`, database `aca_phase2_staging`. No production connection.

## Safety
- Verified disposable fixture key `issue_number=2147483000, pr_number=2147483000` absent before testing.
- Each mutation attempt ran in a single PostgreSQL `DO` statement with a dedicated `role_name` login and explicit `session_user` assertion.
- Denial tests catch only `insufficient_privilege` (SQLSTATE 42501), and fail if a prohibited operation succeeds. Unexpected errors fail the test.
- The one authorized INSERT used a nested PL/pgSQL exception subtransaction: successful INSERT followed by a forced sentinel exception, caught outside the inner block. PostgreSQL rolls back the inner block's database changes.
- Post-test owner catalog/count query confirmed `fixture_ledgers=0` and `fixture_events=0` for disposable keys.

## Observed test outcomes
| Login | Attempt | Observed |
|---|---|---|
| `aca_p2_initializer_a` | INSERT ledger repo 880002 (unauthorized) | SQLSTATE 42501 caught; test passed |
| `aca_p2_initializer_a` | INSERT ledger repo 880001 (authorized) | INSERT succeeded; deliberate subtransaction exception rolled it back; test passed |
| `aca_p2_writer_a` | INSERT event repo 880002 (unauthorized) | SQLSTATE 42501 caught; test passed |
| `aca_p2_reader_a` | INSERT ledger repo 880001 | SQLSTATE 42501 caught; test passed |
| `aca_phase2a_runtime_reader` | INSERT ledger repo 880001 | SQLSTATE 42501 caught; test passed |

**Note:** The tool reports a successful `DO` completion, not the caught exception as a separate row. The test code explicitly raises on unexpected success and only catches the expected SQLSTATE in the inner block. The authorized-insert rollback uses the same subtransaction semantics.

## Not yet proven
- Writer UPDATE isolation across repository fixtures, event positive/negative SELECT RLS, event UPDATE/DELETE immutability against positive fixtures.
- Full operation matrix (initializer UPDATE, writer DELETE, metadata modifications), concurrent race tests, reviewer independence, Render service identity mapping and network isolation.
- Independent cryptographic attestation of test evidence.

**Disposition:** PASS for the five scoped staging transactional cases; overall Phase 2 staging security acceptance remains NO-GO. No persistent fixture rows or production changes.
