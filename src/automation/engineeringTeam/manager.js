'use strict';
const {getRole}=require('./registry');
const {randomUUID}=require('node:crypto');
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(x);
const validRepo=x=>typeof x==='string'&&/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(x);
function createAgentManager({scopes,maxAttempts=2,maxActions=32}={}){
 if(!Array.isArray(scopes)||!scopes.length||scopes.some(s=>!validId(s.product)||!validRepo(s.repository)))throw Error('Invalid scopes');
 if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>2||!Number.isSafeInteger(maxActions)||maxActions<1||maxActions>64)throw Error('Invalid budget');
 const allowed=new Set(scopes.map(s=>JSON.stringify([s.product,s.repository])));
 const tasks=new Map(), quarantined=new Set(),events=[];
 let stopped=false,actions=0;
 function record(taskId,role,decision,reason){events.push(Object.freeze({taskId,role,decision,reason}));}
 function createTask({product,repository,subject}){
  if(stopped||!allowed.has(JSON.stringify([product,repository]))||typeof subject!=='string'||!subject.trim()||subject.length>2000||tasks.size>=64)throw Error('Task denied');
  const task=Object.freeze({id:randomUUID(),product,repository,subject});
  tasks.set(task.id,{task,attempts:new Map(),authors:new Set(),active:new Set()});
  record(task.id,'manager','allow','task-created');return task;
 }
 async function propose({taskId,role,action,adapter}){
  const state=tasks.get(taskId);
  const deny=reason=>{record(state?taskId:null,typeof role==='string'&&Object.hasOwn(require('./registry').roles,role)?role:'unknown','deny',reason);throw Error(reason);};
  if(!state||stopped||quarantined.has(role))return deny('Task or role unavailable');
  let def;try{def=getRole(role);}catch{return deny('Unknown role');}
  if(action!==def.action||typeof adapter!=='function')return deny('Action denied');
  if(state.active.size||actions>=maxActions||(state.attempts.get(role)||0)>=maxAttempts)return deny('Budget or concurrency denied');
  state.attempts.set(role,(state.attempts.get(role)||0)+1);state.active.add(role);actions++;
  record(taskId,role,'allow','offline-proposal');
  try{
   const output=await adapter(Object.freeze({task:state.task,role:def,mode:'offline-proposal-only'}));
   if(stopped||quarantined.has(role))return deny('Stopped during execution');
   if(typeof output!=='string'||!output.trim()||output.length>8000)return deny('Invalid proposal');
   if(role==='backend-developer'||role==='frontend-developer')state.authors.add(role);
   record(taskId,role,'result','proposal-only');
   return Object.freeze({taskId,role,action,output,approval:false});
  }catch(e){record(taskId,role,'error','proposal-failed');throw Error('Offline proposal failed');}
  finally{state.active.delete(role);}
 }
 return Object.freeze({createTask,propose,stop(){stopped=true;record(null,'manager','stop','manual-stop');},quarantine(role){getRole(role);quarantined.add(role);record(null,role,'quarantine','manual-quarantine');},audit(){return events.slice();}});
}
module.exports={createAgentManager};
