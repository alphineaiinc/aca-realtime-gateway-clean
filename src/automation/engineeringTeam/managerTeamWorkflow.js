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
    const task=manager.createTask({product,repository,sha,subject});
    for(const role of order){
     if(stopped)return Object.freeze({state:'stopped',completed:results.length,releaseApproved:false,executionAuthorized:false});
     const proposal=await manager.propose({taskId:task.id,role,action:getRole(role).action});
     if(stopped)return Object.freeze({state:'stopped',completed:results.length,releaseApproved:false,executionAuthorized:false});
     if(!proposal||proposal.taskId!==task.id||proposal.role!==role||proposal.approval!==false)throw Error('Agent handoff denied');
     results.push(Object.freeze({role,output:validateProposal(role,proposal.output),approval:false}));
    }
    return Object.freeze({state:'completed',taskId:task.id,completed:results.length,proposals:Object.freeze(results),releaseApproved:false,executionAuthorized:false});
   }catch{return Object.freeze({state:'failed',completed:results.length,releaseApproved:false,executionAuthorized:false});}
   finally{active=false;}
  }
 });
}
module.exports={createManagerTeamWorkflow,order};
