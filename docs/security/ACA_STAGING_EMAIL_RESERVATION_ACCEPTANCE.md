# ACA controlled staging Gmail acceptance fixture (PR #148)

Candidate scope: only `aca-product-commercial-consolidation`; no production changes, merges, agent dispatch, or new spend.

## Hard prerequisites before any send
1. Exact PR head CI, candidate CodeQL and independent Codex review must pass; do not reuse earlier-SHA gates.
2. The existing free Render service `alphine-aca-product-staging` must run that exact approved SHA. Confirm revision through its endpoint and Render deploy record, never infer from branch name.
3. Confirm Neon project `still-cell-80928176`, branch `br-lucky-surf-bcn2xj6u`, database `aca_product_staging` and a restricted staging-only role. Apply `migrations/018_request_email_reservations.sql` only on that database after schema and role review.
4. Gmail acceptance must use an allowlisted owned test mailbox and a dedicated staging tenant/notification recipient; never send to real customer recipients. No provider call from CI, module import, or migration. Provider credentials must not be printed or stored in the fixture.
5. Cap the acceptance at ONE reserved notification per fixture, ONE provider submission, and ZERO automatic retries. On ambiguous response, leave reservation `reserved` or `uncertain`; reconcile manually against Gmail's message record before changing state.
6. Require explicit invocation of the worker for this fixture, capture opaque request ID, tenant ID, reservation state, provider acknowledgement and redacted timestamps, then revoke tenant/recipient fixture and any temporary privileges. Keep reservation tombstone for replay suppression.

## Acceptance cases
- Empty queue: 0 provider sends and 0 reservations.
- Verified allowlisted recipient: one reservation committed before provider invocation, one send, one delivered acknowledgement.
- Duplicate invocation/concurrent workers: no second provider call for the same request.
- Token/provider failure or provider timeout: reservation remains blocking; 0 automatic retries.
- Database acknowledgement failure after provider success: preserved reservation blocks resend.
- Reject inactive/unverified/malformed recipients and non-staging tenant identities.
- Roll back disposable customer fixture records only after retaining redacted reservation evidence for audit; use dedicated test IDs, never customer records.

## Current hold
The draft PR branch and staging deployment branch are different. Never deploy by merely re-triggering Render against the existing staging branch: it would deploy a different SHA. Do not enable Gmail credentials or send messages until all gates and fixture restrictions are verified.
