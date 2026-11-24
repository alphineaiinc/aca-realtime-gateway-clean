'use strict';
const {getRole}=require('./registry');
const sequence=Object.freeze(['orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops']);
async function runOfflineTeam({manager,task}){
 const proposals=[];
 for(const role of sequence){
  const result=await manager.propose({taskId:task.id,role,action:getRole(role).action});
  proposals.push(result);
 }
 return Object.freeze({taskId:task.id,proposals:Object.freeze(proposals),status:'offline-proposals-only',releaseApproved:false});
}
module.exports={sequence,runOfflineTeam};
