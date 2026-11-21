"use strict";
/**
 * Explicit service boundary for automation ledger operations. The caller
 * supplies an already-authenticated dedicated PostgreSQL session and verified
 * GitHub scope. This module does not open connections or authenticate users.
 *
 * Never use a Pool directly: each operation must hold one pinned client.
 */
const {assertAutomationDbRole}=require("./automationDbRoleGuard");
const {initializeCorrectionLedger}=require("./postgresCorrectionLedgerInitializer");
const {appendCorrection}=require("./postgresCorrectionLedger");
const {readCorrectionHistory}=require("./postgresCorrectionHistoryReader");
function validScope(scope){
 return scope&&["repositoryId","issueNumber","prNumber"].every(k=>
   Number.isSafeInteger(scope[k])&&scope[k]>0);
}
function checkContext(context,scope){
 if(!validScope(scope)||!context||context.authenticated!==true||
    context.repositoryId!==scope.repositoryId||
    context.issueNumber!==scope.issueNumber||
    context.prNumber!==scope.prNumber||
    !/^[a-f0-9]{40}$/.test(context.headSha||""))
   throw new Error("unverified_automation_service_scope");
}
async function withAuthorizedClient(client,operation,context,scope,fn){
 checkContext(context,scope);
 if(!client||typeof client.query!=="function"||typeof client.release!=="function")
   throw new Error("missing_pinned_automation_db_session");
 await assertAutomationDbRole(client,operation);
 return fn();
}
async function serviceReadHistory(client,scope,context){
 return withAuthorizedClient(client,"read",context,scope,
   ()=>readCorrectionHistory(client,scope));
}
async function serviceInitializeLedger(client,scope,context){
 return withAuthorizedClient(client,"initialize",context,scope,
   ()=>initializeCorrectionLedger(client,scope,{
     verifiedHeadSha:context.headSha,authenticatedInitializer:true
   }));
}
async function serviceAppendCorrection(client,claim,context){
 return withAuthorizedClient(client,"append",context,claim,()=>{
   if(claim.priorHeadSha!==context.headSha)
     throw new Error("stale_correction_service_head");
   if(!Number.isSafeInteger(context.actorId)||context.actorId<=0||
      claim.actorId!==context.actorId)
     throw new Error("unverified_correction_service_actor");
   return appendCorrection(client,claim);
 });
}
module.exports={serviceReadHistory,serviceInitializeLedger,serviceAppendCorrection};
