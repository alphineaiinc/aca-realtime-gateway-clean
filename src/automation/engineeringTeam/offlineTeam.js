'use strict';
const {getRole}=require('./registry');
const sequence=Object.freeze(['orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops']);
async function runOfflineTeam({manager,task,adapters}){
 const proposals=[];
 for(const role of sequence){
  if(!adapters||!Object.hasOwn(adapters,role)||typeof adapters[role]!=='function')throw Error('Missing role adapter');
 }
 for(const role of sequence){
  const prior=Object.freeze(proposals.slice());
  const result=await manager.propose({taskId:task.id,role,action:getRole(role).action,adapter:context=>adapters[role](context,prior)});
  proposals.push(result);
 }
 return Object.freeze({taskId:task.id,proposals:Object.freeze(proposals),status:'offline-proposals-only',releaseApproved:false});
}
module.exports={sequence,runOfflineTeam};
