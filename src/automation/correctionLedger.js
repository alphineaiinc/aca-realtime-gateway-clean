"use strict";

/**
 * Advisory correction ledger. An authenticated caller must persist attempts
 * outside PR commits and verify the issue/PR identity before using this.
 * This module never dispatches agents or writes GitHub state.
 */
const {MAX_CORRECTIONS} = require("./prSupervisionPolicy");

function validCount(n) { return Number.isSafeInteger(n) && n >= 0; }
function validSha(s) { return typeof s === "string" && /^[0-9a-f]{40}$/i.test(s); }

function evaluateCorrection({attempts, previousFailureFingerprint, failureFingerprint,
  previousHeadSha, headSha} = {}) {
  if (!validCount(attempts) || typeof failureFingerprint !== "string" ||
      failureFingerprint.length < 8 || failureFingerprint.length > 256 ||
      !validSha(headSha) || (previousHeadSha != null && !validSha(previousHeadSha)) ||
      (previousFailureFingerprint != null && typeof previousFailureFingerprint !== "string")) {
    return Object.freeze({allowed:false, reason:"invalid_or_missing_ledger", remaining:0});
  }
  if (attempts >= MAX_CORRECTIONS) {
    return Object.freeze({allowed:false, reason:"correction_budget_exhausted", remaining:0});
  }
  // Repeated failure after a correction, even on a different SHA, escalates.
  if (attempts > 0 && previousFailureFingerprint === failureFingerprint) {
    return Object.freeze({allowed:false, reason:"unchanged_failure", remaining:MAX_CORRECTIONS-attempts});
  }
  if (attempts > 0 && previousHeadSha === headSha) {
    return Object.freeze({allowed:false, reason:"no_new_head_after_correction", remaining:MAX_CORRECTIONS-attempts});
  }
  return Object.freeze({allowed:true, reason:"manual_correction_request_possible",
    remaining:MAX_CORRECTIONS-attempts});
}

module.exports = {evaluateCorrection};
