'use strict';
const {createQueueDrain}=require('./queueDrain');
const {createContinuationGate}=require('./continuationGate');
const {createCiEventAdmission}=require('./ciEventAdmission');
const {createQueueWorker}=require('./queueWorker');
const {getRole}=require('./registry');
// Explicit offline composition; no listener, scheduler or live provider.
function createContinuationRuntime({pool,scope,workflowId,authenticate,managerCredential,workerCredential,role,readRun,queue,manager,loadTask,maxSteps=8}={}){
 getRole(role);
 if(typeof authenticate!=='function'||typeof managerCredential!=='string'||typeof workerCredential!=='string'||managerCredential===workerCredential)throw Error('Invalid runtime identity');
 const pinned=Object.freeze({...scope});
 const worker=createQueueWorker({queue,manager,loadTask});
 const drain=createQueueDrain({worker,maxSteps});
 const admitEvent=createCiEventAdmission({pool,scope:pinned,workflowId,authenticate,credential:managerCredential});
 const gate=createContinuationGate({scope:pinned,workflowId,readRun,admitEvent,drain});
 let stopped=false;
 return Object.freeze({
  async onCompletion({runId,attempt}={}){
   if(stopped)return Object.freeze({state:'stopped'});
   const actor=await authenticate(workerCredential);
   if(!actor||actor.permission!=='queue.work'||actor.role!==role||actor.product!==pinned.product||actor.repository!==pinned.repository||actor.sha!==pinned.sha)return Object.freeze({state:'denied'});
   if(stopped)return Object.freeze({state:'stopped'});
   return gate.onCompletion({runId,attempt,role,credential:workerCredential});
  },
  stop(){stopped=true;drain.stop();},
  executionAllowed:()=>false
 });
}
module.exports={createContinuationRuntime};
