'use strict';
const {getRole}=require('./registry');
const {validateProposal}=require('./contracts');
const order=Object.freeze(['orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops']);
function createManagerTeamWorkflow({manager,maxRoles=8}={}){
 if(typeof manager?.createTask!=='function'||typeof manager?.propose!=='function'||maxRoles!==8)throw Error('Invalid manager workflow');
 let active=false,stopped=false;
 return Object.freeze({
  stop(){stopped=true;manager.stop?.();},
  executionAllowed:()=>false,
  async run({product,repository,sha,subject}={}){
   if(active||stopped)throw Error('Workflow unavailable');
   active=true;const results=[];
   try{
    if(typeof product!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(product)||typeof repository!=='string'||!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)||typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha))throw Error('Invalid task scope');
    const task=manager.createTask({product,repository,sha,subject});
    const taskId=task?.id;
    const bound=()=>task&&task.id===taskId&&task.product===product&&task.repository===repository&&task.sha===sha;
    if(typeof taskId!=='string'||!taskId.trim()||!bound())throw Error('Invalid task identity or scope');
    for(const role of order){
     if(stopped)return Object.freeze({state:'stopped',completed:results.length,releaseApproved:false,executionAuthorized:false});
     if(!bound())throw Error('Task scope changed');
     const proposal=await manager.propose({taskId,role,action:getRole(role).action});
     if(stopped)return Object.freeze({state:'stopped',completed:results.length,releaseApproved:false,executionAuthorized:false});
     if(!bound()||!proposal||proposal.taskId!==taskId||proposal.role!==role||proposal.action!==getRole(role).action||proposal.approval!==false)throw Error('Agent handoff denied');
     results.push(Object.freeze({role,output:validateProposal(role,proposal.output),approval:false}));
    }
    return Object.freeze({state:'completed',taskId,completed:results.length,proposals:Object.freeze(results),releaseApproved:false,executionAuthorized:false});
   }catch{return Object.freeze({state:stopped?'stopped':'failed',completed:results.length,releaseApproved:false,executionAuthorized:false});}
   finally{active=false;}
  }
 });
}
module.exports={createManagerTeamWorkflow,order};
