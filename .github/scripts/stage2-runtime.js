'use strict';
const {admit}=require('./stage2-admission');
const {tick}=require('./stage2-tick');
const repository='alphineaiinc/aca-realtime-gateway-clean',sha='6678909c7e9e60c08b0bc56c150e9031900a3984';
function reader({token,context,clock=Date.now,fetchImpl=globalThis.fetch}){
 const {config,start,expires,controlVersion}=context;
 const allowed=()=>admit({...context,now:clock()});
 return async scope=>{
  if(!allowed()||!token||!(/^[a-f0-9]{40}$/.test(config||''))||!Number.isSafeInteger(expires)||scope?.repository!==repository||scope?.sha!==sha||scope?.product!=='aca')return true;
  try{
   const res=await fetchImpl('https://api.github.com/repos/'+repository+'/issues/153',{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
   if(!res.ok)return true;
   const d=await res.json(),lines=typeof d.body==='string'?d.body.split(/\r?\n/):[],controls=lines.filter(l=>l.includes('<!-- aca-stage1:')||l.includes('<!-- aca-stage2:')),labels=Array.isArray(d.labels)?d.labels.map(l=>String(l.name||'').toLowerCase()):[];
   return !allowed()||Date.parse(d.updated_at)!==controlVersion||d.number!==153||d.pull_request!=null||d.state!=='open'||!labels.includes('aca:auto/blocked')||labels.some(l=>['aca:stage1/stop','aca:stage1/enabled','aca:auto/docs-test'].includes(l))||controls.length!==1||controls[0]!=='<!-- aca-stage2:enable:'+config+':'+start+':'+expires+' -->';
  }catch{return true;}
 };
}
async function run({context,token,observeOnce,fetchImpl,clock=Date.now}){
 const scope={repository,sha,product:'aca'};
 const stop=reader({token,context,clock,fetchImpl});
 const transport=fetchImpl||globalThis.fetch;
 const guardedFetch=(url,options)=>{if(!admit({...context,now:clock()}))throw Error('Approval expired');return transport(url,options);};
 return tick({context,clock,readStop:()=>stop(scope),observe:()=>observeOnce({env:{ACA_RESTRICTED_MANAGER_ENABLED:'true',ACA_RESTRICTED_MANAGER_ISSUE:'118',ACA_RESTRICTED_MANAGER_PRODUCT:'aca',ACA_RESTRICTED_MANAGER_REPOSITORY:repository,ACA_RESTRICTED_MANAGER_HEAD_SHA:sha,ACA_RESTRICTED_MANAGER_GITHUB_READ_TOKEN:token},readStopState:stop,fetchImpl:guardedFetch})});
}
module.exports={reader,run};
