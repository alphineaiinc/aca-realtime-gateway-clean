'use strict';
const {evaluateSafeQueueDecision}=require('../safeQueuePolicy');
const {digest}=require('./patchPlanner');
// Evidence bridge only. The original queue policy is not execution authority.
// Trusted host must obtain fresh issue/active-lock state from GitHub.
function createQueuePolicyBridge({manifest,readQueueState}={}){
 if(!manifest||manifest.executionAuthorized!==false||!Number.isSafeInteger(manifest.issue)||typeof readQueueState!=='function')throw Error('Invalid queue policy bridge');
 const scope=Object.freeze({...manifest.scope});
 const issueNumber=manifest.issue;
 const manifestDigest=manifest.evidenceSha256;
 return Object.freeze({async evaluate(){
  const state=await readQueueState(Object.freeze({scope,issueNumber}));
  if(!state||state.repository!==scope.repository||state.headSha!==scope.sha||state.issue?.number!==issueNumber||state.issue.isPullRequest!==false||!Array.isArray(state.issue.labels)||!state.issue.labels.every(x=>typeof x==='string')||!Array.isArray(state.issue.assignees)||!Array.isArray(state.activeIssueNumbers)||!state.activeIssueNumbers.every(x=>Number.isSafeInteger(x)&&x>0))throw Error('Queue evidence denied');
  const decision=evaluateSafeQueueDecision({issue:state.issue,activeIssueNumbers:state.activeIssueNumbers});
  const payload={scope,issueNumber,manifestDigest,policyVersion:decision.policyVersion,decision:decision.code};
  return Object.freeze({...payload,evidenceSha256:digest(JSON.stringify(payload)),eligibleForPreparation:decision.status==='queued',executionAuthorized:false});
 }});
}
module.exports={createQueuePolicyBridge};
