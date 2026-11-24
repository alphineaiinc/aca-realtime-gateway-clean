'use strict';
const {createAgentManager}=require('./manager');
const {createQueueWorker}=require('./queueWorker');
const {sequence}=require('./offlineTeam');
const {digest}=require('./patchPlanner');
// Bounded fixture orchestration only. Dedicated empty disposable queue required.
// No scheduler, provider defaults, mutation transport or automatic retries.
function createFixtureRuntime({scope,queue,ledger,adapters,preparation,authorize}={}){
 if(!scope||typeof queue?.enqueue!=='function'||typeof ledger?.readFixturePrior!=='function'||typeof preparation?.prepare!=='function'||typeof authorize!=='function')throw Error('Invalid fixture runtime');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 let consumed=false;
 return Object.freeze({async run({subject,developerRole,managerCredential,workerCredentials}={}){
  if(consumed||typeof subject!=='string'||!subject.trim()||subject.length>2000||!['backend-developer','frontend-developer'].includes(developerRole)||!workerCredentials||sequence.some(r=>typeof workerCredentials[r]!=='string'||!workerCredentials[r]))throw Error('Fixture runtime denied');
  if(await authorize({scope:pinned,action:'team.simulate'})!==true||consumed)throw Error('Fixture runtime denied');
  consumed=true;
  const workflow=await ledger.create(managerCredential);
  const manager=createAgentManager({scopes:[pinned],adapters,fixturePriorEnabled:true});
  for(const [step,role] of sequence.entries()){
   if(await authorize({scope:pinned,action:'role.simulate',role})!==true)throw Error('Role admission denied');
   const prior=await ledger.readFixturePrior({credential:managerCredential,id:workflow.id});
   if(prior.length!==step)throw Error('Fixture handoff denied');
   const taskId=await queue.enqueue({scope:pinned,role,credential:managerCredential,workflowId:workflow.id,workflowStep:step});
   const worker=createQueueWorker({queue,manager,fixtureProposalStorage:true,loadTask:async({id})=>{
    if(id!==taskId)throw Error('Unexpected task');
    return {id,...pinned,subject,fixturePrior:prior};
   }});
   const completed=await worker.runOnce({scope:pinned,role,credential:workerCredentials[role],expectedTaskId:taskId});
   if(completed.state!=='succeeded'||completed.taskId!==taskId)throw Error('Fixture task incomplete; reconcile');
   await ledger.advance({credential:managerCredential,id:workflow.id,step,taskId});
  }
  const proposals=await ledger.readFixturePrior({credential:managerCredential,id:workflow.id});
  if(proposals.length!==8||proposals.some((p,i)=>p.role!==sequence[i]||p.approval!==false))throw Error('Team evidence incomplete');
  const teamDigest=digest(JSON.stringify(proposals));
  if(await authorize({scope:pinned,action:'change.simulate',teamDigest})!==true)throw Error('Change admission denied');
  // The trusted subject remains separate from untrusted proposal content.
  const change=await preparation.prepare({role:developerRole,subject});
  if(change?.executionAuthorized!==false||change.releaseApproved!==false||change.plan?.scope?.sha!==pinned.sha||change.plan?.scope?.repository!==pinned.repository||change.plan?.scope?.product!==pinned.product)throw Error('Change evidence denied');
  return Object.freeze({workflowId:workflow.id,teamDigest,proposals,change,mode:'fixture-only',executionAuthorized:false,releaseApproved:false});
 }});
}
module.exports={createFixtureRuntime};
