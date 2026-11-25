'use strict';
const {getRole}=require('./registry');
const {capabilities}=require('./toolBroker');
const safePath=p=>typeof p==='string'&&p.length<=240&&/^[A-Za-z0-9_.\/-]+$/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!s.startsWith('.'));
const key=s=>JSON.stringify([s.product,s.repository,s.sha]);
// Trusted injected read transport; never accepts URLs, credentials or repository overrides from agents.
function createGitHubEvidenceBroker({scopes,readSource,readIssue,readCI,authorize}={}){
 if(!Array.isArray(scopes)||!scopes.length||scopes.length>32||[readSource,readIssue,readCI,authorize].some(f=>typeof f!=='function'))throw Error('Invalid evidence configuration');
 const allowed=new Map();
 for(const s of scopes){
  if(!s||typeof s.product!=='string'||typeof s.repository!=='string'||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repository)||! /^[a-f0-9]{40}$/.test(s.sha)||!Number.isSafeInteger(s.issue)||s.issue<1||!Array.isArray(s.paths)||s.paths.length>100||!s.paths.every(safePath)||allowed.has(key(s)))throw Error('Invalid evidence scope');
  allowed.set(key(s),{issue:s.issue,paths:new Set(s.paths)});
 }
 return Object.freeze({bind({task,role,sha,isActive,onDecision,maxReads=8}){
  getRole(role);
  if(typeof isActive!=='function'||typeof onDecision!=='function'||!Number.isSafeInteger(maxReads)||maxReads<1||maxReads>16)throw Error('Invalid session');
  const scope=Object.freeze({product:task.product,repository:task.repository,sha});
  const config=allowed.get(key(scope));let closed=false,reads=0,active=false;
  return Object.freeze({async read(request){
   const action=request?.action;
   const known=['source.read','issue.read','ci.read'].includes(action);
   const deny=()=>{onDecision(known?action:'unknown','deny');throw Error('Evidence denied');};
   if(closed||!isActive()||!config||!known||!capabilities[role].includes(action)||active||reads>=maxReads)return deny();
   if(action==='source.read'?(Object.keys(request).length!==2||!Object.hasOwn(request,'path')||!config.paths.has(request.path)):Object.keys(request).length!==1)return deny();
   const path=action==='source.read'?request.path:undefined;
   active=true;reads++;
   try{
    if(await authorize(Object.freeze({scope,role,action}))!==true||closed||!isActive())return deny();
    const result=await (action==='source.read'?readSource({...scope,path}):action==='issue.read'?readIssue({...scope,issue:config.issue}):readCI(scope));
    if(closed||!isActive()||!result||result.repository!==scope.repository||typeof result.text!=='string'||result.text.length>16000||(action==='issue.read'?result.issue!==config.issue:result.sha!==sha)||(action==='source.read'&&result.path!==path))return deny();
    onDecision(action,'allow');
    return Object.freeze({action,text:result.text,sha:action==='issue.read'?null:sha,provenance:action==='issue.read'?'untrusted-mutable-issue':'untrusted-pinned-evidence'});
   }catch{throw Error('Evidence read failed');}
   finally{active=false;}
  },close(){closed=true;}});
 }});
}
module.exports={createGitHubEvidenceBroker};
