'use strict';
const {digest}=require('./patchPlanner');
const repairable=new Set(['test-failure','syntax-failure']);
function createCorrectionLoop({scope,propose,verify,authorize,maxAttempts=2}={}){
 if(!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||!/^[a-f0-9]{40}$/.test(scope.sha)||[propose,verify,authorize].some(f=>typeof f!=='function')||!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>2)throw Error('Invalid correction configuration');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 let active=false,stopped=false,consumed=false;
 const bound=p=>p&&p.scope?.product===pinned.product&&p.scope?.repository===pinned.repository&&p.scope?.sha===pinned.sha&&['backend-developer','frontend-developer'].includes(p.role)&&Array.isArray(p.changes)&&p.executionAuthorized===false&&p.evidenceSha256===digest(JSON.stringify({scope:p.scope,role:p.role,changes:p.changes}));
 const result=(state,attempts)=>Object.freeze({state,attempts,releaseApproved:false});
 return Object.freeze({
 stop(){stopped=true;},executionAllowed:()=>false,
 async run({plan}={}){
  if(active||stopped||consumed||!bound(plan))throw Error('Correction denied');
  active=true;consumed=true;let attempts=0;
  try{
   let current=structuredClone(plan);const seen=new Set([current.evidenceSha256]);
   while(true){
    if(stopped)return result('stopped',attempts);
    if(await authorize({scope:pinned,action:'test.simulate',evidenceSha256:current.evidenceSha256})!==true||stopped)return result('denied',attempts);
    const report=await verify(structuredClone(current));
    if(stopped)return result('stopped',attempts);
    if(!report||report.evidenceSha256!==current.evidenceSha256||report.profile!=='disposable-no-network-no-secrets')return result('unknown',attempts);
    if(report.status==='passed')return Object.freeze({...result('candidate-passed',attempts),candidateDigest:current.evidenceSha256});
    if(report.status!=='failed'||!repairable.has(report.category))return result('blocked',attempts);
    if(attempts>=maxAttempts)return result('limit',attempts);
    if(await authorize({scope:pinned,action:'correction.simulate',evidenceSha256:current.evidenceSha256})!==true||stopped)return result('denied',attempts);
    attempts++;
    const next=await propose({plan:structuredClone(current),category:report.category});
    if(stopped)return result('stopped',attempts);
    if(!bound(next)||next.role!==current.role||seen.has(next.evidenceSha256))return result('blocked',attempts);
    current=structuredClone(next);seen.add(current.evidenceSha256);
   }
  }catch{return result('unknown',attempts);}
  finally{active=false;}
 }
 });
}
module.exports={createCorrectionLoop};
