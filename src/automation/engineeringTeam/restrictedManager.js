'use strict';
// Observation-only facade. No worker, queue mutation, provider, or publication adapter.
function createRestrictedManager({scope,issue,transport}={}){
 if(!scope||typeof scope.product!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(scope.product)||typeof scope.repository!=='string'||!scope.repository.split('/').every(p=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p))||scope.repository.split('/').length!==2||typeof scope.sha!=='string'||!/^[a-f0-9]{40}$/.test(scope.sha)||!Number.isSafeInteger(issue)||issue<1||typeof transport?.readIssue!=='function'||typeof transport?.readCI!=='function')throw Error('Invalid restricted manager configuration');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 const readIssue=transport.readIssue.bind(transport),readCI=transport.readCI.bind(transport);
 const boundary=Object.freeze({executionAuthorized:false,writeAuthorized:false,deployAuthorized:false,paidProviderAuthorized:false});
 return Object.freeze({async observe(){
  try{
   const [i,c]=await Promise.all([readIssue({...pinned,issue}),readCI(pinned)]);
   if(i?.repository!==pinned.repository||i.issue!==issue||c?.repository!==pinned.repository||c.sha!==pinned.sha||typeof c.text!=='string'||c.text.length>16000)throw Error('Evidence denied');
   const data=JSON.parse(c.text);
   if(!Array.isArray(data.runs)||data.runs.length>20||!Number.isSafeInteger(data.total)||data.total<data.runs.length||data.runs.some(r=>!Number.isSafeInteger(r.id)||r.id<1||r.head_sha!==pinned.sha||typeof r.name!=='string'||r.name.length>200||typeof r.status!=='string'||!['queued','pending','requested','waiting','in_progress','completed'].includes(r.status)))throw Error('CI evidence denied');
   const runs=data.runs.map(r=>Object.freeze({id:r.id,name:r.name,status:r.status,conclusion:typeof r.conclusion==='string'?r.conclusion.slice(0,40):null}));
   return Object.freeze({scope:pinned,issue,status:'observed',runs:Object.freeze(runs),partial:data.total>runs.length,...boundary});
  }catch{return Object.freeze({scope:pinned,issue,status:'unavailable',...boundary});}
 }});
}
module.exports={createRestrictedManager};
