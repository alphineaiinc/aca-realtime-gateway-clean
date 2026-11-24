# ACA L5 commercial acceptance
Draft PR 147; no production activation.
- [x] Disable legacy direct invoice generation/payment and payout mutations in reviewed routes.
- [x] Add durable receipt, settlement mapping, private invoice, usage and reservation components.
- [x] Add isolated PostgreSQL concurrency tests; execution result must be checked at final SHA.
- [ ] Verify actual Stripe API version and payment semantics; independently bind customer to tenant.
- [ ] Disable or replace legacy notification mode before activation; verified settlement now bypasses event-derived email.
- [ ] Connect authenticated provider usage sources; establish pricing assignment and completeness watermark.
- [ ] Reconcile late usage without silently modifying closed invoices; approved adjustment workflow required.
- [ ] Reconcile legacy partner credits; prove dispatch ownership, provider settlement and release authorization.
- [ ] Reconcile PR 125 and integrated routing PR 141; review all mounted routes and migrations.
- [ ] Verify restricted database roles, hosted acceptance, independent security review.
No live payments, payouts, production migrations or merges authorized. Passing CI alone is not activation approval.
