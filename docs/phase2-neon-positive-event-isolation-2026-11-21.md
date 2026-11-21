# Phase 2 disposable Neon branch — positive event RLS verification (2026-11-21)

**Authorized scope:** Owner approved create/test/delete of a disposable child branch of the Alphine Phase 2 Neon staging database. No production, merge, deploy, signing or agent dispatch.

## Environment
- Project `still-cell-80928176`; existing default staging parent `br-lucky-surf-bcn2xj6u`.
- Created child `br-sparkling-thunder-bcwud96h`, name `phase2-event-isolation-disposable-20261121`, default=false.
- First create attempt with custom compute suspend timeout was rejected by account policy (HTTP 412); retried without custom compute configuration and succeeded.
- Confirmed `aca_phase2_staging` child database and zero pre-existing ledger rows with disposable issue `2147483001`.

## Actual tests
1. Dedicated initializer A login inserted disposable ledger `(repository_id=880001, issue_number=2147483001, pr_number=2147483001)` in child.
2. Dedicated writer A login inserted positive event `sequence=1`, UUID `00000000-0000-4000-8000-000000000097`, fingerprint `disposable-event-fixture`.
3. Event SELECT visibility against positive fixture: reader A **1** (authorized), reader B **0** (other repo), writer A **1** (authorized), runtime reader **0** (other repo). Sessions reported the matching dedicated `session_user`.
4. Writer A UPDATE and DELETE attempts against existing positive event each rejected with SQLSTATE 42501; test code raised on unexpected mutation success.
5. Post-test child read confirmed event count **1** and fingerprint unchanged.
6. Deleted exactly the created child branch `br-sparkling-thunder-bcwud96h`. Follow-up list_branches returned **only** existing default `staging` branch `br-lucky-surf-bcn2xj6u`. No test fixture persisted on staging parent.

## Interpretation and limits
- Positive event row visibility confirms tested reader/writer repository isolation.
- Writer event mutation was blocked by SQL table permissions (42501), so the immutable trigger itself was not independently exercised by a role granted UPDATE/DELETE.
- Further staging acceptance still needs independent reviewer/key custody, real OAuth browser edge, private mTLS network, signed provenance, adversarial rollback and other gates.
- No application deployment, merges, reviewer signing or autonomous agent dispatch.

**Disposition:** PASS for positive event isolation and cleanup. Overall Phase 2 operational staging acceptance remains NO-GO.
