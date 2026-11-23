'use strict';
// Internal service only. Authorization must be supplied by the trusted operator boundary,
// never from request body fields. No resend or receipt deletion is supported.
function createStripeReconciliation({ receipts, authorize }) {
  if (!receipts || typeof authorize !== 'function') throw new TypeError('Trusted authorization required');
  return {
    async list(actor, limit = 100) {
      if (await authorize(actor, 'stripe.receipts.read') !== true) throw new Error('Forbidden');
      return receipts.listUnresolved(limit);
    }
  };
}
module.exports = { createStripeReconciliation };
