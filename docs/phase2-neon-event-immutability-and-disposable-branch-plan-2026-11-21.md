# Phase 2 staging — event mutation denial and positive fixture isolation boundary (2026-11-21)

## Executed live against isolated staging
Project `still-cell-80928176`, branch `br-lucky-surf-bcn2xj6u`, database `aca_phase2_staging`; dedicated role_name sessions only. No production changes.

- `aca_p2_reader_a`: event UPDATE and DELETE rejected with expected SQLSTATE 42501.
- `aca_p2_writer_a`: event UPDATE and DELETE rejected with expected SQLSTATE 42501.
- `aca_p2_initializer_a`: event UPDATE and DELETE rejected with expected SQLSTATE 42501.
- `aca_phase2a_runtime_reader`: event UPDATE and DELETE rejected with expected SQLSTATE 42501.
- Each test asserted `session_user`, trapped only `insufficient_privilege` in an inner exception block, and raised if mutation unexpectedly succeeded.
- Event SELECT queries grouped by repository returned zero rows for reader A, reader B, writer A and runtime reader. This does **not** establish positive event RLS isolation.

## Why a positive fixture needs a separate isolated database branch
`correction_events` has a BEFORE UPDATE OR DELETE trigger that unconditionally raises `correction_events_are_immutable`. An event committed to the existing staging branch cannot be removed by the normal application path. The ledger INSERT and event INSERT are held by separate dedicated application login roles; the current connector provides independent single-role transactions, not a shared multi-login transaction with guaranteed cross-session rollback.

**Do not** insert positive event fixtures into the current shared staging branch or attempt to disable the immutable trigger to clean them up.

## Next safe integration batch
1. Create a disposable child branch cloned from staging, explicitly non-production, with an expiration/cleanup plan.
2. Validate the child branch has no live external consumers or production secrets; use dedicated role logins.
3. Create disposable parent ledger as initializer A, then disposable event as writer A in the child branch.
4. Read events as reader A, reader B and runtime reader; verify own-repository visibility and cross-repository invisibility.
5. Verify writer UPDATE/DELETE cannot mutate the positive event; assert unchanged version and row contents.
6. Delete the **entire disposable child branch** using explicit scoped owner authorization after evidence capture, rather than attempting event DELETE or trigger bypass.
7. Record audit evidence without leaking secrets; keep all six operational authorization flags false.

**Current disposition:** PASS for eight live mutation-denial cases. Positive event isolation still unproven. No database records were intentionally created or persisted in this batch.
