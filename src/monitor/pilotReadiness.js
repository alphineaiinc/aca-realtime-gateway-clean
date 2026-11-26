"use strict";
// Pure readiness gate; no credentials, network calls or activation.
const REQUIRED = Object.freeze(["verifiedRouting","tenantIsolation","voiceConfirmation","knowledgeIsolation","recipientVerification","deliveryReconciliation","adminAccess","monitoring","rollback","stagingAcceptance"]);
function evaluatePilotReadiness(evidence) {
  const missing=REQUIRED.filter(key=>!Object.hasOwn(evidence||{},key)||evidence[key]!==true);
  return {ready:missing.length===0,missing,activationAuthorized:false};
}
module.exports={REQUIRED,evaluatePilotReadiness};
