"use strict";
const {observe}=require("./pr-supervision-observer");
const {verifyClosingIssueLink}=require("../../src/automation/verifiedPrLink");
const valid=n=>Number.isSafeInteger(n)&&n>0;
// Events are wake-up hints only. Inventory is collected before any observation.
async function reconcile({github,owner,repo,prNumber=null,observeOne=observe}={}){
 if(!github?.rest||typeof github.graphql!=="function"||!owner||!repo||(prNumber!==null&&!valid(prNumber)))throw Error("invalid_reconciliation_arguments");
 const {data:repository}=await github.rest.repos.get({owner,repo});
 if(!valid(repository?.id))throw Error("invalid_repository_identity");
 const numbers=[];
 if(prNumber!==null)numbers.push(prNumber);
 else{
  const seen=new Set();
  for await(const page of github.paginate.iterator(github.rest.pulls.list,{owner,repo,state:"open",per_page:100})){
   if(!Array.isArray(page.data))throw Error("invalid_pr_inventory");
   for(const pr of page.data){
    if(!valid(pr?.number)||seen.has(pr.number))throw Error("invalid_pr_inventory");
    seen.add(pr.number);numbers.push(pr.number);
   }
  }
 }
 const decisions=[];
 for(const number of numbers){
  const data=await github.graphql(`query($owner:String!,$repo:String!,$pr:Int!){
   repository(owner:$owner,name:$repo){pullRequest(number:$pr){number closingIssuesReferences(first:2){pageInfo{hasNextPage} nodes{number repository{databaseId}}}}}
  }`,{owner,repo,pr:number});
  const issueNumber=data?.repository?.pullRequest?.closingIssuesReferences?.nodes?.[0]?.number;
  if(!valid(issueNumber)||!verifyClosingIssueLink({prNumber:number,issueNumber,repositoryId:String(repository.id),data})){
   decisions.push({prNumber:number,state:"blocked",reason:"unverified_issue_association"});continue;
  }
  const decision=await observeOne({github,owner,repo,prNumber:number,issueNumber});
  decisions.push({prNumber:number,decision});
 }
 return decisions;
}
module.exports={reconcile};
