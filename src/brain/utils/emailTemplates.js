/**
 * src/brain/utils/emailTemplates.js
 * Story 11.9 — Email Templates
 */

function wrap(body) {
  return `
  <div style="background:#0f172a;padding:20px;font-family:'Segoe UI',sans-serif;color:#f1f5f9;">
    <div style="max-width:600px;margin:auto;background:#1e293b;padding:30px;border-radius:12px;">
      <h2 style="color:#38bdf8;margin-bottom:20px;">Alphine AI Billing</h2>
      ${body}
      <p style="color:#94a3b8;font-size:12px;margin-top:40px;">
        © ${new Date().getFullYear()} Alphine AI — Automated Call Attender
      </p>
    </div>
  </div>`;
}

/* ---------------------------
   invoice.created
---------------------------- */
function tplInvoiceCreated(inv) {
  return wrap(`
    <p style="font-size:15px;">Your invoice for <strong>${inv.amount_due / 100} ${inv.currency.toUpperCase()}</strong> is ready.</p>
    <p>Period: ${inv.period_start} → ${inv.period_end}</p>
    <a href="${inv.hosted_invoice_url}" style="color:#38bdf8;">View Invoice</a>
  `);
}

/* ---------------------------
   invoice.payment_succeeded
---------------------------- */
function tplInvoicePaid(inv) {
  return wrap(`
    <p style="font-size:15px;">Your payment of <strong>${inv.amount_paid / 100} ${inv.currency.toUpperCase()}</strong> was successful.</p>
    <p>Invoice #: ${inv.number}</p>
    <a href="${inv.hosted_invoice_url}" style="color:#38bdf8;">View Receipt</a>
  `);
}

/* ---------------------------
   invoice.payment_failed
---------------------------- */
function tplPaymentFailed(inv) {
  return wrap(`
    <p style="color:#f87171;font-size:15px;">Your recent payment attempt failed.</p>
    <p>Please update your payment method immediately to avoid service interruption.</p>
    <a href="${inv.hosted_invoice_url}" style="color:#38bdf8;">View Invoice</a>
  `);
}

/* ---------------------------
   subscription.updated
---------------------------- */
function tplSubscriptionRenewed(sub) {
  return wrap(`
    <p>Your subscription was updated.</p>
    <p>Current period: ${sub.current_period_start} → ${sub.current_period_end}</p>
  `);
}

/* ---------------------------
   charge.refunded
---------------------------- */
function tplRefundIssued(charge) {
  return wrap(`
    <p>A refund of <strong>${charge.amount_refunded / 100} ${charge.currency.toUpperCase()}</strong> has been issued.</p>
    <p>It may take 5–10 business days to reflect.</p>
  `);
}

/* ---------------------------
   trial.ending (manual use)
---------------------------- */
function tplTrialEnding(data) {
  return wrap(`
    <p>Your trial is ending soon.</p>
    <p>Please add a payment method to continue using Alphine AI.</p>
  `);
}

/* ---------------------------
   partner payout
---------------------------- */
function tplPartnerPayout(meta) {
  return wrap(`
    <p>Your partner payout has been processed.</p>
    <p>Amount: <strong>${meta.amount / 100} USD</strong></p>
    <p>Reference: ${meta.payout_ref}</p>
  `);
}

module.exports = {
  tplInvoiceCreated,
  tplInvoicePaid,
  tplPaymentFailed,
  tplSubscriptionRenewed,
  tplRefundIssued,
  tplTrialEnding,
  tplPartnerPayout
};
