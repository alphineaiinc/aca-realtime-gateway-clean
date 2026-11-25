'use strict';
const {getRole}=require('./registry');
const {validateProposal}=require('./contracts');
const sequence=Object.freeze(['orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops']);
async function runOfflineTeam({manager,task}={}){
 if(typeof manager?.propose!=='function'||typeof task?.id!=='string'||!task.id.trim())throw Error('Invalid offline task');
 const taskId=task.id;
 const scope=Object.freeze({product:task.product,repository:task.repository,sha:task.sha});
 const bound=()=>task.id===taskId&&task.product===scope.product&&task.repository===scope.repository&&task.sha===scope.sha;
 const proposals=[];
 for(const role of sequence){
  if(!bound())throw Error('Offline task scope changed');
  const action=getRole(role).action;
  const result=await manager.propose({taskId,role,action});
  if(!bound()||!result||result.taskId!==taskId||result.role!==role||result.action!==action||result.approval!==false)throw Error('Offline handoff denied');
  proposals.push(Object.freeze({taskId,role,action,output:validateProposal(role,result.output),approval:false}));
 }
 return Object.freeze({taskId,proposals:Object.freeze(proposals),status:'offline-proposals-only',releaseApproved:false});
}
module.exports={sequence,runOfflineTeam};
