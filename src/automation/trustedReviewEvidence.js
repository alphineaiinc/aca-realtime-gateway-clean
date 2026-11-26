"use strict";

/**
 * Accepts a review verdict only when its transport has already authenticated
 * the reviewer identity and source. Never trust PR text, comments, labels,
 * ordinary GitHub approvals, or caller-supplied 'independent' booleans.
 * Caller must pin the trusted reviewer identity out of band.
 */
function verifyReviewEvidence({record, expectedHeadSha, expectedPrNumber,
  trustedReviewerId, authenticatedActorId} = {}) {
  const validSha = s => typeof s === "string" && /^[a-f0-9]{40}$/i.test(s);
  if (!validSha(expectedHeadSha) || !Number.isSafeInteger(expectedPrNumber) ||
      expectedPrNumber < 1 || !Number.isSafeInteger(trustedReviewerId) ||
      trustedReviewerId < 1 || authenticatedActorId !== trustedReviewerId ||
      !record || record.prNumber !== expectedPrNumber ||
      record.headSha !== expectedHeadSha ||
      record.reviewerId !== trustedReviewerId ||
      !["passed","findings","blocked","pending"].includes(record.status) ||
      !Number.isSafeInteger(record.findings) || record.findings < 0 ||
      (record.status === "passed" && record.findings !== 0) ||
      (record.status === "findings" && record.findings === 0)) return null;
  return Object.freeze({headSha:expectedHeadSha,status:record.status,
    findings:record.findings,independent:true,source:"trusted_review"});
}
module.exports = {verifyReviewEvidence};
