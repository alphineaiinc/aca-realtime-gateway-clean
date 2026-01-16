"use strict";

/**
 * Minimal intent carryover:
 * - If user says "continue/yes/do that", reuse last activeIntent if present.
 * - Otherwise infer a simple intent tag from keywords.
 *
 * This is intentionally lightweight for v1.
 */

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function isFollowUp(s) {
  const t = normalize(s);
  return (
    t === "yes" ||
    t === "ok" ||
    t === "okay" ||
    t === "continue" ||
    t === "go on" ||
    t === "do it" ||
    t === "do that" ||
    t === "proceed" ||
    t === "next" ||
    t === "what next" ||
    t.startsWith("continue ")
  );
}

function inferIntentTag(text) {
  const t = normalize(text);

  if (!t) return "";

  // very simple buckets; expand later
  if (/(price|pricing|cost|charge|billing|invoice|stripe)/.test(t)) return "pricing_billing";
  if (/(deploy|render|vercel|heroku|release|prod|production)/.test(t)) return "deploy_release";
  if (/(bug|error|stack|crash|fix|issue)/.test(t)) return "debug_fix";
  if (/(doc|document|write up|documentation)/.test(t)) return "documentation";
  if (/(security|auth|jwt|token|encrypt|privacy)/.test(t)) return "security_auth";

  return "general";
}

function resolveActiveIntent({ userText, priorActiveIntent }) {
  if (isFollowUp(userText) && priorActiveIntent) return priorActiveIntent;
  return inferIntentTag(userText);
}

module.exports = { resolveActiveIntent, inferIntentTag, isFollowUp };
