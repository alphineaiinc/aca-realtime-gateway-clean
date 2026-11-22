# Phase 2 isolated staging — writer UPDATE and event FK denial evidence (2026-11-21)

**Scope:** Explicit owner-authorized isolated staging-only transactional write-denial testing; Neon project `still-cell-80928176`, branch `br-lucky-surf-bcn2xj6u`, database `aca_phase2_staging`. Dedicated login sessions, no production, merge, deploy, signing or agent dispatch.

## Results
1. Writer A `aca_p2_writer_a` attempted `UPDATE ... SET version=version WHERE repository_id=880002 AND issue_number=20 AND pr_number=21`. Explicit `GET DIAGNOSTICS ROW_COUNT` asserted **0 affected rows**. Reader B had previously confirmed repository B's target ledger row exists. No value changed.
2. Reader A `aca_p2_reader_a` attempted a ledger UPDATE and caught expected `insufficient_privilege` SQLSTATE 42501.
3. Initializer A `aca_p2_initializer_a` attempted ledger UPDATE and caught expected SQLSTATE 42501.
4. Writer A attempted DELETE against disposable-key ledger predicate and caught expected SQLSTATE 42501.
5. Writer A attempted own-repository event INSERT with disposable missing-parent key `2147483000`; the statement reached expected `foreign_key_violation` SQLSTATE 23503, consistent with own-repository INSERT policy allowing it past RLS. No event inserted. This is **not** a positive committed event fixture.
6. Post-test privileged read-only verification: existing ledger fixture rows `(880001,20,21)` and `(880002,20,21)` retain `version=0`; disposable ledger/event rows with issue/pr `2147483000` remain **0/0**.

All procedural tests asserted the actual `session_user` and failed on unexpected operation success. The `DO` statements use SQL exception subtransactions for expected denials. No changes were persisted.

## Limits
- Cross-repository UPDATE returned zero affected rows; this is RLS filtering, **not** a SQLSTATE 42501 exception.
- The own-repository event INSERT reaching the FK proves a different constraint blocked it, not that event SELECT visibility has been tested.
- Positive event fixtures, UPDATE/DELETE immutability against real event rows, concurrent replay and independent staging attestation remain unverified.
- No new database schema, grants, roles, or credentials were created.

**Disposition:** PASS for scoped writer cross-repo UPDATE filtering and role operation denials. Overall Phase 2 staging acceptance remains NO-GO.
