# Phase 2 Neon staging — live read-only repository isolation (2026-11-21)

**Scope:** Project `still-cell-80928176`, branch `br-lucky-surf-bcn2xj6u`, database `aca_phase2_staging`. Queries used the Neon connection's **role_name** to authenticate as three dedicated staging logins; returned `current_user=session_user` for each. All queries were SELECT only. No credentials displayed, data changed, or production services touched.

## Observed login-role tests
| Authenticated login | Ledger repo 880001 | Ledger repo 880002 | Ledger repo 1080201236 | Event rows |
|---|---:|---:|---:|---:|
| `aca_p2_reader_a` | 1 | 0 | 0 | 0 |
| `aca_p2_reader_b` | 0 | 1 | 0 | 0 |
| `aca_phase2a_runtime_reader` | 0 | 0 | 1 | 0 |

Each login's query session reported its own identity in `current_user` and `session_user`. Both grouped repository queries and explicit per-repository `COUNT(*) FILTER` checks agreed.

## What is proven
- Existing correction ledger rows are filtered by repository when queried through these three real non-BYPASSRLS staging logins.
- Cross-repository ledger SELECTs for the two test repository IDs and the runtime repository returned zero visible rows for unauthorized roles.
- Role membership and RLS policy structure were inspected separately in `docs/phase2-neon-staging-role-audit-2026-11-21.md`.

## What remains unproven
- The unauthorized repository rows **exist for each role's test comparison** based on another login's observed count; this is a positive/negative test for these seeded rows, not a proof covering all future rows, policies or SQL paths.
- Correction events have zero rows visible to all three logins; **event isolation cannot be claimed as tested** without known authorized and unauthorized event fixtures.
- Writer/initializer INSERT/UPDATE/DELETE denial, role privilege escalation, function-execution grants and metadata visibility have not been exercised.
- The `repository_role_scopes` table has RLS disabled and is directly readable by `aca_phase2a_runtime_reader`; independently review this deliberate-or-accidental metadata exposure.
- No runtime Render connection-string role mapping, network ingress restriction, browser OAuth, private service, real mTLS, or reviewer signing key custody has been validated.

## Acceptance
**PASS: scoped read-only ledger repository isolation for three staging identities and three existing repository fixtures.**
**NO-GO: full operational staging database acceptance** pending event fixtures, write isolation, role privilege review and independent evidence.

No authorization to deploy, merge, sign, dispatch, provision credentials, or change database objects follows from this result.
