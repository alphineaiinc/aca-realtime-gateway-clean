'use strict';
const {getRole,roles}=require('./registry');
const {validateProposal,contract}=require('./contracts');
const {randomUUID}=require('node:crypto');
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(x);
const validRepo=x=>typeof x==='string'&&/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(x);
function createAgentManager({scopes,maxAttempts=2,maxActions=32,adapters,broker,fixturePriorEnabled=false}={}){
 if(!Array.isArray(scopes)||!scopes.length||scopes.some(s=>!validId(s.product)||!validRepo(s.repository)))throw Error('Invalid scopes');
 if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>2||!Number.isSafeInteger(maxActions)||maxActions<1||maxActions>64)throw Error('Invalid budget');
 if(!adapters||Object.keys(adapters).length!==Object.keys(roles).length||Object.keys(roles).some(role=>!Object.hasOwn(adapters,role)||typeof adapters[role]!=='function'))throw Error('Trusted adapter registry required');
 if(broker!==undefined&&typeof broker.bind!=='function')throw Error('Invalid broker');
 const trusted=Object.freeze(Object.fromEntries(Object.keys(roles).map(role=>[role,adapters[role]])));
 const allowed=new Set(scopes.map(s=>JSON.stringify([s.product,s.repository])));
 const tasks=new Map(), quarantined=new Set(),events=[];
 let stopped=false,actions=0;
 function record(taskId,role,decision,reason){events.push(Object.freeze({taskId,role,decision,reason}));}
 function createTask({product,repository,subject,sha,fixturePrior}){
  if((broker&&!(typeof sha==='string'&&/^[a-f0-9]{40}$/.test(sha)))||stopped||!allowed.has(JSON.stringify([product,repository]))||typeof subject!=='string'||!subject.trim()||subject.length>2000||tasks.size>=64)throw Error('Task denied');
  let prior=[];
  if(fixturePrior!==undefined){
   if(fixturePriorEnabled!==true||!Array.isArray(fixturePrior)||fixturePrior.length>7)throw Error('Fixture prior denied');
   const sequence=['orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops'];
   prior=fixturePrior.map((p,i)=>{
    if(!p||p.role!==sequence[i]||p.approval!==false)throw Error('Fixture prior denied');
    return Object.freeze({role:p.role,output:validateProposal(p.role,p.output),approval:false});
   });
  }
  const task=Object.freeze({id:randomUUID(),product,repository,subject,sha});
  tasks.set(task.id,{task,attempts:new Map(),results:new Map(),active:new Set(),fixturePrior:Object.freeze(prior),fixtureBound:fixturePrior!==undefined});
  record(task.id,'manager','allow','task-created');return task;
 }
 async function propose({taskId,role,action}){
  const state=tasks.get(taskId);
  const deny=reason=>{record(state?taskId:null,typeof role==='string'&&Object.hasOwn(roles,role)?role:'unknown','deny',reason);throw Error(reason);};
  if(!state||stopped||quarantined.has(role))return deny('Task or role unavailable');
  let def;try{def=getRole(role);}catch{return deny('Unknown role');}
  if(action!==def.action)return deny('Action denied');
  if(state.fixtureBound&&role!==['orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops'][state.fixturePrior.length])return deny('Fixture sequence denied');
  if(state.active.size||actions>=maxActions||(state.attempts.get(role)||0)>=maxAttempts)return deny('Budget or concurrency denied');
  state.attempts.set(role,(state.attempts.get(role)||0)+1);state.active.add(role);actions++;
  record(taskId,role,'allow','offline-proposal');
  let session;
  try{
   if(broker)session=broker.bind({task:state.task,role,sha:state.task.sha,isActive:()=>!stopped&&!quarantined.has(role)&&state.active.has(role),onDecision:(action,decision)=>record(taskId,role,decision,'tool:'+action)});
   const raw=await trusted[role](Object.freeze({task:state.task,role:def,contract:contract(role),mode:'offline-proposal-only',tools:session?Object.freeze({read:session.read}):undefined,prior:Object.freeze([...state.fixturePrior,...state.results.values()])}));
   if(stopped||quarantined.has(role))return deny('Stopped during execution');
   const output=validateProposal(role,raw);
   record(taskId,role,'result','proposal-only');
   const proposal=Object.freeze({taskId,role,action,output,approval:false});
   state.results.set(role,proposal);return proposal;
  }catch(e){record(taskId,role,'error','proposal-failed');throw Error('Offline proposal failed');}
  finally{session?.close();state.active.delete(role);}
 }
 return Object.freeze({createTask,propose,stop(){stopped=true;record(null,'manager','stop','manual-stop');},quarantine(role){getRole(role);quarantined.add(role);record(null,role,'quarantine','manual-quarantine');},audit(){return events.slice();}});
}
module.exports={createAgentManager};
