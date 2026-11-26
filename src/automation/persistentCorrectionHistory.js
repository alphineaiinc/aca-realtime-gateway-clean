"use strict";

/**
 * Fail-closed correction history validation. Persistence and authenticated
 * retrieval belong to the calling adapter; PR commits and comments are never
 * an authoritative ledger. This function does not write or dispatch anything.
 */
const {MAX_CORRECTIONS} = require("./prSupervisionPolicy");
const SHA=/^[a-f0-9]{40}$/i;
function validSha(value) {return typeof value==="string" && SHA.test(value);}
function validNumber(value) {return Number.isSafeInteger(value) && value>0;}
function validFingerprint(value) {
  return typeof value==="string" && value.length>=8 && value.length<=256;
}
function verifyCorrectionHistory({ledger,repositoryId,issueNumber,prNumber,headSha,
  authenticatedStore=false}={}) {
  if (authenticatedStore!==true || !validNumber(repositoryId) ||
      !validNumber(issueNumber) || !validNumber(prNumber) || !validSha(headSha) ||
      !ledger || ledger.repositoryId!==repositoryId ||
      ledger.issueNumber!==issueNumber || ledger.prNumber!==prNumber ||
      !Array.isArray(ledger.attempts) || ledger.attempts.length>MAX_CORRECTIONS ||
      ledger.schemaVersion!==1) return null;
  const seen=new Set();
  let previousSequence=0;
  for(const item of ledger.attempts) {
    if (!item || !Number.isSafeInteger(item.sequence) ||
        item.sequence!==previousSequence+1 || !validSha(item.headSha) ||
        !validFingerprint(item.failureFingerprint) || seen.has(item.headSha)) return null;
    previousSequence=item.sequence;
    seen.add(item.headSha);
  }
  const last=ledger.attempts.at(-1);
  // Rebase is allowed but must never erase prior attempts.
  const unchangedFailureCount=last && ledger.currentFailureFingerprint === last.failureFingerprint ? 1 : 0;
  if (ledger.currentFailureFingerprint!=null &&
      !validFingerprint(ledger.currentFailureFingerprint)) return null;
  return Object.freeze({attempts:ledger.attempts.length,unchangedFailureCount});
}
module.exports={verifyCorrectionHistory};
