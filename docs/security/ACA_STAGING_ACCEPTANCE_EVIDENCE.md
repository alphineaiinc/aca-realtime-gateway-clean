# ACA staging acceptance evidence — 2026-11-24

Scope: existing free Render service alphine-aca-product-staging; Neon database aca_product_staging, branch br-lucky-surf-bcn2xj6u. No production changes or provider calls authorized.

## Deployment
- Candidate bab2b34f0344e6dc42b52a6eb53b7e40bf97baa2; CI 1025 passed.
- Existing staging branch fast-forwarded 51 commits, zero divergence. Prior head b78905dbddc77f32044c1db8e9039aa80f1e3dc7 preserved in aca-staging-checkpoint-b78905d.
- Render deploy dep-dc2ttgp5efls738rgogg live at 19:01:32 UTC, exact candidate confirmed.
- CI 1037 hosted job 138699391927 reported 13/13 HTTP checks at 19:01:10 UTC, before rollout completed. Not exact-revision hosted acceptance. Repeat after rollout.

## Staging schema adaptations
Seven draft migrations applied transactionally: usage identity, period pricing, usage closure guard, usage immutability, usage reconciliation, Stripe customer identity, rate limit buckets. Public rate-limit grants revoked.
Financial roles migration applied; three NOLOGIN roles. Runtime price/customer insert/update/delete revoked; reconciliation update/delete revoked. Broader runtime financial permissions and operational role separation remain open.
003_partner_rewards and draft_aca_partner_reservations applied; runtime funds/reservation privileges revoked.
003_partner_payouts applied only table and indexes; optional view references absent partner_rewards and was excluded. 005_partner_payouts incompatible duplicate definition not applied. Runtime payout history SELECT retained, INSERT/UPDATE/DELETE revoked. No funds seeded.
These are staging-specific adaptations, not an approved production migration recipe.

## Remaining gates
Strict TLS policy and fail-closed provider payout implementation require CI and redeployment. Hosted negative checks must run after deployment. Restricted acceptance role remains NOLOGIN; protected environment secret not configured. Authenticated tenant isolation, real calls, provider settlement, durable usage recovery and full commercial permission acceptance remain unverified. Do not infer launch readiness from CI alone.
