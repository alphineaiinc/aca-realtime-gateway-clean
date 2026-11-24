# Commercial release gates — PR 148
No live activation authorized.
- Reconcile duplicate evidence before migration.
- Require trusted UTC occurrence timestamps and durable late-event reconciliation.
- Provision prices through separate trusted role.
- Runtime must not own financial tables or have TRUNCATE, DDL or trigger-disable privileges.
- Verify restricted roles, Stripe API compatibility, customer binding, reward funding and settlement.
- Run exact candidate CI and hosted acceptance before release.
