'use strict';
// Provider failures after dispatch begins are ambiguous; never automatically resend.
function createDurableStripeProcessor({ receipts, deliver }) {
  if (!receipts || typeof deliver !== 'function') throw new TypeError('Receipt store and delivery required');
  return async function processVerifiedEvent(event) {
    const claim = await receipts.claim(event.id);
    if (claim.status === 'completed') return 'completed';
    if (claim.status !== 'claimed') return 'blocked';
    try {
      await deliver(event);
    } catch {
      await receipts.finish(event.id, claim.claimId, 'uncertain');
      return 'blocked';
    }
    await receipts.finish(event.id, claim.claimId, 'completed');
    return 'completed';
  };
}
module.exports = { createDurableStripeProcessor };
