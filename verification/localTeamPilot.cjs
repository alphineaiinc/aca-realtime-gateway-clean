'use strict';
// Explicitly invoked by a separately authorized isolated host only. No CLI, cloud
// provider, real repository tools, credentials, writes, approval or release grant.
const {createLocalModelTransport}=require('./localModelTransport.cjs');
const {createModelAdapters}=require('../src/automation/engineeringTeam/modelAdapter');
const {createAgentManager}=require('../src/automation/engineeringTeam/manager');
const {createManagerTeamWorkflow,order}=require('../src/automation/engineeringTeam/managerTeamWorkflow');
const {createFixtureBroker,capabilities}=require('../src/automation/engineeringTeam/toolBroker');
const scope=Object.freeze({product:'development-automation',repository:'alphineaiinc/aca-realtime-gateway-clean',sha:'5f683f1ed79cd6730be6824955aca9a2e4ed4537'});
const path='src/synthetic.js';
const snapshot=Object.freeze({...scope,issue:'Synthetic requirement: propose a pure input validation function and tests. No actual writes or test execution claims.',ci:'Synthetic CI: not executed.',files:Object.freeze([{path,text:'// Synthetic example only\nfunction validate(value) { return typeof value === "string"; }'}])});
async function runLocalTeam({port,authorize,expiresAt,signal}={}){
 if(!signal||typeof signal.addEventListener!=='function'||signal.aborted||typeof authorize!=='function')throw Error('Host admission denied');
 const allowed=role=>!signal.aborted&&Date.now()<expiresAt&&authorize(role)===true;
 const transport=createLocalModelTransport({port,authorize:allowed,expiresAt});
 const broker=createFixtureBroker({snapshots:[snapshot]});
 const decisions=[];
 // Verify each role's actual fixture-broker allowlist before any model request.
 for(const role of order){
  if(!allowed(role))throw Error('Host admission denied');
  const session=broker.bind({task:scope,role,sha:scope.sha,isActive:()=>allowed(role),onDecision:(action,decision)=>decisions.push({role,action,decision})});
  try{
   for(const action of ['issue.read','source.read','ci.read','repository.write']){
    const input=action==='source.read'?{action,path}:{action};
    let permitted=false;try{await session.read(input);permitted=true;}catch{}
    if(permitted!==capabilities[role].includes(action))throw Error('Fixture permission mismatch');
   }
   let denied=false;try{await session.read({action:'source.read',path:'../secret'});}catch{denied=true;}
   if(!denied)throw Error('Fixture path denial failed');
  }finally{session.close();}
 }
 const evidencePlan=Object.fromEntries(order.map(role=>[role,capabilities[role].map(action=>action==='source.read'?{action,path}:{action})]));
 const adapters=createModelAdapters({generate:transport.generate,maxInputBytes:16000,maxOutputBytes:16000,evidencePlan});
 const manager=createAgentManager({scopes:[scope],adapters,broker,maxAttempts:1,maxActions:8});
 const workflow=createManagerTeamWorkflow({manager});
 const stop=()=>{transport.stop();workflow.stop();};
 signal.addEventListener('abort',stop,{once:true});
 try{
  if(signal.aborted)stop();
  const result=await workflow.run({...scope,subject:snapshot.issue});
  return Object.freeze({result,decisions:Object.freeze(decisions),audit:manager.audit(),usage:transport.usage(),scope,executionAuthorized:false,releaseApproved:false});
 }finally{signal.removeEventListener('abort',stop);stop();}
}
module.exports={runLocalTeam,scope};
