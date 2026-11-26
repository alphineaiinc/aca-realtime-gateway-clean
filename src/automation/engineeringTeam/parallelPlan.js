'use strict';
const {getRole}=require('./registry');
const stages=Object.freeze([['orchestrator'],['project-manager'],['solution-architect'],['backend-developer','frontend-developer'],['qa-testing','security-reviewer'],['devops']].map(Object.freeze));
// Independent fixture executor per role. Existing manager concurrency guard stays intact.
function createParallelPlan({execute,maxParallel=2}={}){
 if(typeof execute!=='function'||!Number.isSafeInteger(maxParallel)||maxParallel<1||maxParallel>2)throw Error('Invalid coordination configuration');
 let active=false,stopped=false;
 return Object.freeze({
 async run({taskId}={}){
  if(active||stopped||typeof taskId!=='string'||!/^[a-zA-Z0-9_.-]{1,80}$/.test(taskId))throw Error('Coordination denied');
  active=true;const results=[];
  try{
   for(const stage of stages){
    const prior=Object.freeze(results.slice());
    for(let i=0;i<stage.length;i+=maxParallel){
     if(stopped)return Object.freeze({state:'stopped',completed:results.length,releaseApproved:false});
     const settled=await Promise.allSettled(stage.slice(i,i+maxParallel).map(async role=>{
      const proposal=await execute(Object.freeze({taskId,role,action:getRole(role).action,prior}));
      if(!proposal||proposal.role!==role||proposal.action!==getRole(role).action||proposal.approval!==false||proposal.taskId!==taskId)throw Error('Invalid proposal');
      const {validateProposal}=require('./contracts');
      return Object.freeze({taskId,role,action:getRole(role).action,approval:false,output:validateProposal(role,proposal.output)});
     }));
     if(stopped||settled.some(x=>x.status!=='fulfilled'))return Object.freeze({state:stopped?'stopped':'failed',completed:results.length,releaseApproved:false});
     results.push(...settled.map(x=>x.value));
    }
   }
   return Object.freeze({state:'completed',completed:results.length,proposals:Object.freeze(results),releaseApproved:false});
  }finally{active=false;}
 },
 stop(){stopped=true;},
 executionAllowed:()=>false
 });
}
module.exports={createParallelPlan,stages};
