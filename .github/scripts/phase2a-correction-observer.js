"use strict";
/**
 * Read-only live PR/issue association for a completed ACA CI event.
 * All API calls use a caller-authenticated, read-only GitHub client.
 * No checkout of untrusted PR code. A ledger connection is never inferred.
 */
const {triageCompletedCi}=require("../../src/automation/phase2aCiTriage");
const {createCorrectionHandoff}=require("../../src/automation/phase2aCorrectionHandoff");
const {verifyClosingIssueLink}=require("../../src/automation/verifiedPrLink");
const {readCorrectionHistory}=require("../../src/automation/postgresCorrectionHistoryReader");

const positive=n=>Number.isSafeInteger(n)&&n>0;
const SHA=/^[a-f0-9]{40}$/;
async function observeCorrectionHandoff({github,owner,repo,event,
 expectedRepositoryId,expectedWorkflowId,authenticatedLedgerClient=null}={}) {
 const ci=triageCompletedCi({event,expectedRepositoryId,expectedWorkflowId});
 const unverified=createCorrectionHandoff({event,expectedRepositoryId,expectedWorkflowId});
 if(ci.state!=="failed") return unverified;
 if(!github?.rest?.repos?.get||!github?.rest?.repos?.listPullRequestsAssociatedWithCommit||
    !github?.rest?.pulls?.get||typeof github.graphql!=="function"||
    typeof owner!=="string"||!owner||typeof repo!=="string"||!repo)
   return unverified;
 try {
  const {data:repository}=await github.rest.repos.get({owner,repo});
  if(repository?.id!==expectedRepositoryId)return unverified;
  const {data:links}=await github.rest.repos.listPullRequestsAssociatedWithCommit({
   owner,repo,commit_sha:ci.headSha,per_page:2
  });
  if(!Array.isArray(links)||links.length!==1)return unverified;
  const candidate=links[0];
  if(!positive(candidate?.number))return unverified;
  const {data:pr}=await github.rest.pulls.get({owner,repo,pull_number:candidate.number});
  if(pr?.number!==candidate.number||pr?.state!=="open"||pr?.draft!==false||
     pr?.head?.sha!==ci.headSha||!SHA.test(pr.head.sha)||
     pr?.head?.repo?.id!==expectedRepositoryId||pr?.base?.repo?.id!==expectedRepositoryId)
    return unverified;
  const link=await github.graphql(`query($owner:String!,$repo:String!,$pr:Int!) {
    repository(owner:$owner,name:$repo) {
      pullRequest(number:$pr) {
        number
        closingIssuesReferences(first:2) {
          pageInfo { hasNextPage }
          nodes { number repository { databaseId } }
        }
      }
    }
  }`,{owner,repo,pr:pr.number});
  const issues=link?.repository?.pullRequest?.closingIssuesReferences?.nodes;
  const issueNumber=Array.isArray(issues)&&issues.length===1?issues[0]?.number:null;
  if(!positive(issueNumber)||!verifyClosingIssueLink({
    prNumber:pr.number,issueNumber,repositoryId:String(expectedRepositoryId),data:link
  }))return unverified;
  const {data:issue}=await github.rest.issues.get({owner,repo,issue_number:issueNumber});
  // Only an open allowlisted issue is eligible to request a correction.
  const {eligibleIssue}=require("./pr-supervision-observer");
  if(!eligibleIssue(issue))return unverified;
  let history;
  if(authenticatedLedgerClient){
   try{
    const h=await readCorrectionHistory(authenticatedLedgerClient,{
     repositoryId:expectedRepositoryId,issueNumber,prNumber:pr.number
    });
    if(h.attempts>0&&h.lastResultingHeadSha!==ci.headSha)return unverified;
    history={attempts:h.attempts,unchangedFailureCount:h.unchangedFailureCount,
     headSha:ci.headSha,repositoryId:expectedRepositoryId,
     issueNumber,prNumber:pr.number};
   }catch{return unverified;}
  }
  return createCorrectionHandoff({
   event,expectedRepositoryId,expectedWorkflowId,
   pr:{state:pr.state,draft:pr.draft,number:pr.number,issueNumber,
       headSha:pr.head.sha,repositoryId:pr.head.repo.id,
       baseRepositoryId:pr.base.repo.id},
   verifiedIssueLink:true,history
  });
 }catch{return unverified;}
}
module.exports={observeCorrectionHandoff};
