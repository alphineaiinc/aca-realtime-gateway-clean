# Commercial release gates — PR 148
No live activation authorized.
- Reconcile duplicate evidence before migration.
- Require trusted UTC occurrence timestamps and durable late-event reconciliation.
- Provision prices through separate trusted role.
- Runtime must not own financial tables or have TRUNCATE, DDL or trigger-disable privileges.
- Verify restricted roles, Stripe API compatibility, customer binding, reward funding and settlement.
- Run exact candidate CI and hosted acceptance before release.

## Consolidated migration dependencies
Apply only after schema and existing data preflight, in isolated acceptance first.
- 014 Stripe reconciliation before draft_aca_stripe_customer_identity.sql; existing bindings require verified customer mapping before FK validation.
- 016 usage keys and 017 invoice periods before draft_aca_usage_identity.sql, draft_aca_period_pricing.sql, draft_aca_usage_closure_guard.sql, draft_aca_usage_immutability.sql, draft_aca_usage_reconciliation.sql.
- draft_aca_financial_roles.sql after all usage/pricing tables; confirm actual sequence names, cluster role availability and inherited grants. No automatic membership or credentials.
- draft_aca_rate_limit_buckets.sql before enabling shared rate-limited routes.
- draft_aca_partner_reservations.sql requires canonical partners schema.

## Provider binding
Use verifyAndBindInvoice with a trusted Stripe client and previously verified tenant/customer mapping. The helper is not a public endpoint and is not yet wired to provisioning. No live API calls are required for unit tests. Keep billing disabled until actual provider contract and trusted provisioning acceptance pass.
