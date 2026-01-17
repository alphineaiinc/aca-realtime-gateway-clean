"use strict";

/**
 * Redact obvious secrets/credentials before storing in memory.
 * Keep it conservative: we prefer over-redacting to under-redacting.
 */
function redactText(input) {
  if (!input || typeof input !== "string") return "";

  let s = input;

  // Redact JWT-like tokens
  s = s.replace(/\beyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\b/g, "[REDACTED_JWT]");

  // Redact OpenAI/Stripe/Twilio-like keys (best-effort patterns)
  s = s.replace(/\bsk-[A-Za-z0-9]{10,}\b/g, "[REDACTED_KEY]");
  s = s.replace(/\brk_(live|test)_[A-Za-z0-9]{10,}\b/g, "[REDACTED_STRIPE_KEY]");
  s = s.replace(/\bwhsec_[A-Za-z0-9]{10,}\b/g, "[REDACTED_STRIPE_WEBHOOK_SECRET]");
  s = s.replace(/\bAC[a-f0-9]{32}\b/gi, "[REDACTED_TWILIO_SID]");
  s = s.replace(/\b[a-f0-9]{32}\b/gi, (m) => (m.length === 32 ? "[REDACTED_32HEX]" : m));

  // Redact Authorization headers that might get pasted
  s = s.replace(/Authorization:\s*Bearer\s+[^\s]+/gi, "Authorization: Bearer [REDACTED]");

  return s;
}

module.exports = { redactText };
