'use strict';
const {getRole}=require('./registry');
const capabilities=Object.freeze({
 'project-manager':Object.freeze(['issue.read']),
 'solution-architect':Object.freeze(['issue.read','source.read']),
 'backend-developer':Object.freeze(['issue.read','source.read']),
 'frontend-developer':Object.freeze(['issue.read','source.read']),
 'qa-testing':Object.freeze(['issue.read','source.read','ci.read']),
 'security-reviewer':Object.freeze(['issue.read','source.read','ci.read']),
 'devops':Object.freeze(['source.read','ci.read']),
 'orchestrator':Object.freeze(['issue.read','ci.read'])
});
const validPath=p=>typeof p==='string'&&p.length<=240&&/^[A-Za-z0-9_.\/-]+$/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!s.startsWith('.'))&&!/(^|\/)(node_modules|secrets?|credentials?)(\/|$)/i.test(p);
function createFixtureBroker({snapshots}={}){
 if(!Array.isArray(snapshots)||snapshots.length>32)throw Error('Invalid fixture snapshots');
 const data=new Map();
 for(const s of snapshots){
  if(!s||typeof s.product!=='string'||typeof s.repository!=='string'||!/^([a-f0-9]{40})$/.test(s.sha)||!Array.isArray(s.files)||s.files.length>100)throw Error('Invalid snapshot');
  const key=JSON.stringify([s.product,s.repository,s.sha]);
  if(data.has(key))throw Error('Duplicate snapshot');
  const files=new Map();
  for(const f of s.files){
   if(!validPath(f.path)||typeof f.text!=='string'||f.text.length>16000||files.has(f.path))throw Error('Invalid fixture file');
   files.set(f.path,f.text);
  }
  if(typeof s.issue!=='string'||s.issue.length>8000||typeof s.ci!=='string'||s.ci.length>8000)throw Error('Invalid fixture evidence');
  data.set(key,{files,issue:s.issue,ci:s.ci});
 }
 return Object.freeze({bind({task,role,sha,isActive,onDecision,maxReads=8}){
  getRole(role);
  if(typeof isActive!=='function'||typeof onDecision!=='function'||!Number.isSafeInteger(maxReads)||maxReads<1||maxReads>16)throw Error('Invalid capability context');
  const snapshot=data.get(JSON.stringify([task.product,task.repository,sha]));
  let reads=0,closed=false;
  const read=async(request)=>{
   const action=request?.action;
   const known=typeof action==='string'&&['issue.read','source.read','ci.read'].includes(action);
   const deny=()=>{onDecision(known?action:'unknown','deny');throw Error('Capability denied');};
   if(closed||isActive()!==true||!request||typeof request!=='object'||Array.isArray(request)||!Object.hasOwn(request,'action')||!snapshot||!known||!capabilities[role].includes(action)||reads>=maxReads)return deny();
   const keys=Object.keys(request);
   if(action==='source.read'){
    if(keys.length!==2||!Object.hasOwn(request,'path')||!validPath(request.path)||!snapshot.files.has(request.path))return deny();
   }else if(keys.length!==1)return deny();
   reads++;onDecision(action,'allow');
   return Object.freeze({sha,action,text:action==='source.read'?snapshot.files.get(request.path):action==='issue.read'?snapshot.issue:snapshot.ci,provenance:'offline-fixture'});
  };
  return Object.freeze({read,close(){closed=true;}});
 }});
}
module.exports={createFixtureBroker,capabilities};
