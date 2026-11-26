'use strict';
// Caller supplies trusted CI evidence reader and durable event admission.
// No webhook listener, scheduler, provider calls or live execution.
function createContinuationGate({scope,workflowId,readRun,admitEvent,drain}={}){
 if(!scope||!/^[a-f0-9]{40}$/.test(scope.sha)||typeof scope.repository!=='string'||!Number.isSafeInteger(workflowId)||workflowId<1||typeof readRun!=='function'||typeof admitEvent!=='function'||typeof drain?.run!=='function')throw Error('Invalid continuation configuration');
 const pinned=Object.freeze({...scope});
 let active=false;
 return Object.freeze({async onCompletion({runId,attempt,role,credential}={}){
  if(active)throw Error('Continuation busy');
  if(!Number.isSafeInteger(runId)||runId<1||!Number.isSafeInteger(attempt)||attempt<1)throw Error('Invalid event');
  active=true;
  try{
   const run=await readRun(runId);
   if(!run||run.id!==runId||run.run_attempt!==attempt||run.workflow_id!==workflowId||run.repository?.full_name!==pinned.repository||run.head_sha!==pinned.sha||run.status!=='completed'||run.conclusion!=='success')return Object.freeze({state:'denied'});
   const admitted=await admitEvent(Object.freeze({scope:pinned,workflowId,runId,attempt}));
   if(admitted!==true)return Object.freeze({state:'duplicate-or-denied'});
   const result=await drain.run({scope:pinned,role,credential});
   return Object.freeze({state:'drained',result});
  }finally{active=false;}
 }});
}
module.exports={createContinuationGate};
