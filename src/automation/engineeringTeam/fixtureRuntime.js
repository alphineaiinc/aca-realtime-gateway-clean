'use strict';
const {createAgentManager}=require('./manager');
const {createQueueWorker}=require('./queueWorker');
const {sequence}=require('./offlineTeam');
const {digest}=require('./patchPlanner');
// Durable, explicitly invoked fixture workflow. Unknown in-flight work is never replayed.
function createFixtureRuntime({scope,queue,ledger,adapters,preparation,authorize}={}){
 if(!scope||typeof queue?.enqueue!=='function'||typeof queue?.inspectWorkflowStep!=='function'||typeof ledger?.create!=='function'||typeof ledger?.status!=='function'||typeof ledger?.readFixturePrior!=='function'||typeof preparation?.prepare!=='function'||typeof authorize!=='function')throw Error('Invalid fixture runtime');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 let active=false,created=false;
 async function drive({workflowId,subject,developerRole,managerCredential,workerCredentials}){
  if(active)throw Error('Fixture runtime busy');
  if(typeof workflowId!=='string'||typeof subject!=='string'||!subject.trim()||subject.length>2000||!['backend-developer','frontend-developer'].includes(developerRole)||!workerCredentials||sequence.some(r=>typeof workerCredentials[r]!=='string'||!workerCredentials[r]))throw Error('Fixture runtime denied');
  active=true;
  try{
   if(await authorize({scope:pinned,action:'team.simulate'})!==true)return Object.freeze({state:'denied',workflowId,executionAuthorized:false,releaseApproved:false});
   const status=await ledger.status({credential:managerCredential,id:workflowId});
   let step=status.next_step;
   if(!Number.isSafeInteger(step)||step<0||step>8)throw Error('Workflow state invalid');
   for(;step<sequence.length;step++){
    const role=sequence[step];
    if(await authorize({scope:pinned,action:'role.simulate',role})!==true)return Object.freeze({state:'denied',workflowId,nextStep:step,executionAuthorized:false,releaseApproved:false});
    const existing=await queue.inspectWorkflowStep({scope:pinned,workflowId,workflowStep:step,credential:managerCredential});
    if(existing&&existing.role!==role)throw Error('Workflow task role mismatch');
    if(existing?.state==='running')return Object.freeze({state:'needs-reconciliation',workflowId,nextStep:step,taskId:existing.id,reason:'active-or-unknown-lease',executionAuthorized:false,releaseApproved:false});
    if(existing?.state==='failed'||existing?.state==='cancelled')return Object.freeze({state:'blocked',workflowId,nextStep:step,taskId:existing.id,reason:'terminal-task-requires-owner-reconciliation',executionAuthorized:false,releaseApproved:false});
    if(existing?.state==='succeeded'){
     if(!existing.has_receipt)throw Error('Succeeded task missing receipt');
     await ledger.advance({credential:managerCredential,id:workflowId,step,taskId:existing.id});
     continue;
    }
    const prior=await ledger.readFixturePrior({credential:managerCredential,id:workflowId});
    if(prior.length!==step)throw Error('Fixture handoff denied');
    const taskId=existing?.id??await queue.enqueue({scope:pinned,role,credential:managerCredential,workflowId,workflowStep:step});
    const manager=createAgentManager({scopes:[pinned],adapters,fixturePriorEnabled:true});
    const worker=createQueueWorker({queue,manager,fixtureProposalStorage:true,loadTask:async({id})=>{
     if(id!==taskId)throw Error('Unexpected task');
     return {id,...pinned,subject,fixturePrior:prior};
    }});
    const completed=await worker.runOnce({scope:pinned,role,credential:workerCredentials[role],expectedTaskId:taskId});
    if(completed.state==='queued')return Object.freeze({state:'retryable',workflowId,nextStep:step,taskId,executionAuthorized:false,releaseApproved:false});
    if(completed.state!=='succeeded'||completed.taskId!==taskId)throw Error('Fixture task incomplete; reconcile');
    await ledger.advance({credential:managerCredential,id:workflowId,step,taskId});
   }
   const proposals=await ledger.readFixturePrior({credential:managerCredential,id:workflowId});
   if(proposals.length!==8||proposals.some((p,i)=>p.role!==sequence[i]||p.approval!==false))throw Error('Team evidence incomplete');
   const teamDigest=digest(JSON.stringify(proposals));
   if(await authorize({scope:pinned,action:'change.simulate',teamDigest})!==true)return Object.freeze({state:'team-complete',workflowId,teamDigest,proposals,executionAuthorized:false,releaseApproved:false});
   const change=await preparation.prepare({role:developerRole,subject});
   if(change?.executionAuthorized!==false||change.releaseApproved!==false||change.plan?.scope?.sha!==pinned.sha||change.plan?.scope?.repository!==pinned.repository||change.plan?.scope?.product!==pinned.product)throw Error('Change evidence denied');
   return Object.freeze({state:'completed',workflowId,teamDigest,proposals,change,mode:'fixture-only',executionAuthorized:false,releaseApproved:false});
  }finally{active=false;}
 }
 return Object.freeze({
  async run(input={}){
   if(created)throw Error('Fixture runtime consumed');
   if(!input.managerCredential||!input.subject)throw Error('Fixture runtime denied');
   created=true;
   const workflow=await ledger.create(input.managerCredential);
   return drive({...input,workflowId:workflow.id});
  },
  async resume(input={}){
   if(!input.workflowId)throw Error('Workflow id required');
   return drive(input);
  },
  executionAllowed:()=>false
 });
}
module.exports={createFixtureRuntime};
