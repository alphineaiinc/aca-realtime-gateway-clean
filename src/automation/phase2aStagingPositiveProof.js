"use strict";
/**
 * ISOLATED PROOF ONLY. This never yields a production correction request.
 * No agent dispatch, ledger initialization, DB writes, reviewer attestation,
 * status checks or authorization to act. No runtime route invokes this.
 *
 * The staging issue label is deliberately DISTINCT from safe-Codex queue
 * labels. The test may inspect a real failed CI run without assigning Codex.
 */
const {triageCompletedCi}=require("./phase2aCiTriage");
const {verifyClosingIssueLink}=require("./verifiedPrLink");
const {readCorrectionHistory}=require("./postgresCorrectionHistoryReader");
const TEST_LABEL="aca:phase2a/staging-proof-only";
const SHA=/^[a-f0-9]{40}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
function report(stage,scope={}){
 return Object.freeze({
  state:stage==="complete"?"staging_proof_only_ready":"staging_proof_blocked",
  proofOnly:true,productionAuthorization:false,
  ownerApprovalRequested:false,ownerApprovalAuthorized:false,
  agentDispatchAuthorized:false,dispatched:false,
  mergeAuthorized:false,deployAuthorized:false,
  signingAuthorized:false,stage,
  runId:scope.runId??null,prNumber:scope.prNumber??null,
  issueNumber:scope.issueNumber??null,
  headSha:scope.headSha??null
 });
}
async function verifyStagingProof({github,ledgerClient,owner,repo,
 repositoryId,workflowId,runId,prNumber,issueNumber,expectedHeadSha,
 expiresAt,now=Date.now()}={}){
 // Expiry is checked before any external requests. Max 30 minute TTL is
 // enforced by caller-created expiry and proof must expire in the future.
 if(!positive(repositoryId)||!positive(workflowId)||!positive(runId)||
    !positive(prNumber)||!positive(issueNumber)||!SHA.test(expectedHeadSha||"")||
    !/^[A-Za-z0-9_.-]+$/.test(owner||"")||
    !/^[A-Za-z0-9_.-]+$/.test(repo||"")||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(expiresAt)||
    expiresAt<=now||expiresAt>now+30*60*1000||
    !github?.rest?.repos?.get||!github?.rest?.actions?.getWorkflowRun||
    !github?.rest?.pulls?.get||!github?.rest?.issues?.get||
    !github?.rest?.repos?.listPullRequestsAssociatedWithCommit||
    typeof github.graphql!=="function"||
    !ledgerClient||typeof ledgerClient.query!=="function")
  return report("configuration");
 const scope={runId,prNumber,issueNumber,headSha:expectedHeadSha};
 try{
  const {data:repository}=await github.rest.repos.get({owner,repo});
  if(repository?.id!==repositoryId)return report("repository",scope);
  const {data:run}=await github.rest.actions.getWorkflowRun({owner,repo,run_id:runId});
  const ci=triageCompletedCi({event:{action:"completed",
    repository:{id:repositoryId},workflow_run:run},
    expectedRepositoryId:repositoryId,expectedWorkflowId:workflowId});
  if(ci.state!=="failed"||run?.id!==runId||ci.headSha!==expectedHeadSha||
     !["failure","timed_out"].includes(run.conclusion))
   return report("failed_ci",scope);
  const {data:associations}=await github.rest.repos.listPullRequestsAssociatedWithCommit({
   owner,repo,commit_sha:expectedHeadSha,per_page:2
  });
  if(!Array.isArray(associations)||associations.length!==1||
     associations[0]?.number!==prNumber)return report("pr_association",scope);
  const {data:pr}=await github.rest.pulls.get({owner,repo,pull_number:prNumber});
  if(pr?.number!==prNumber||pr.state!=="open"||pr.draft!==false||
     pr.head?.sha!==expectedHeadSha||
     pr.head?.repo?.id!==repositoryId||pr.base?.repo?.id!==repositoryId)
   return report("current_pr_head",scope);
  const data=await github.graphql(`query($owner:String!,$repo:String!,$pr:Int!) {
   repository(owner:$owner,name:$repo) {pullRequest(number:$pr) {
    number closingIssuesReferences(first:2) {
     pageInfo {hasNextPage} nodes {number repository {databaseId}}
    }
   }}
  }`,{owner,repo,pr:prNumber});
  if(!verifyClosingIssueLink({prNumber,issueNumber,
      repositoryId:String(repositoryId),data}))
   return report("issue_association",scope);
  const {data:issue}=await github.rest.issues.get({owner,repo,issue_number:issueNumber});
  const labels=Array.isArray(issue?.labels)?
   issue.labels.map(x=>String(typeof x==="string"?x:x?.name||"").toLowerCase()):[];
  if(issue?.number!==issueNumber||issue.pull_request||issue.state!=="open"||
     !labels.includes(TEST_LABEL)||
     labels.some(x=>x==="aca:auto/active"||x==="aca:auto/manual-dispatch-requested"))
   return report("test_issue",scope);
  // Only the existing scoped, read-only ledger reader may access this.
  // An absent ledger is UNKNOWN, never treated as a fresh row.
  const history=await readCorrectionHistory(ledgerClient,{
   repositoryId,issueNumber,prNumber
  });
  if(history.attempts!==0||history.unchangedFailureCount!==0)
   return report("ledger_not_fresh",scope);
  // Reverify the PR head after the ledger read; prevents a stale proof.
  const {data:confirmed}=await github.rest.pulls.get({owner,repo,pull_number:prNumber});
  if(confirmed?.number!==prNumber||confirmed.state!=="open"||
     confirmed.draft!==false||confirmed.head?.sha!==expectedHeadSha||
     confirmed.head?.repo?.id!==repositoryId||
     confirmed.base?.repo?.id!==repositoryId)
   return report("head_changed",scope);
  if(Date.now()>=expiresAt)return report("expired",scope);
  return report("complete",scope);
 }catch{return report("evidence_unavailable",scope);}
}
module.exports={verifyStagingProof,TEST_LABEL};
