'use strict';
const repository='alphineaiinc/aca-realtime-gateway-clean', sha='6678909c7e9e60c08b0bc56c150e9031900a3984', issue=153;
function stopReader(token,configSha,fetchImpl=globalThis.fetch){
 return async scope=>{
  if(!token||!(/^[a-f0-9]{40}$/.test(configSha||''))||scope.repository!==repository||scope.sha!==sha||scope.product!=='aca')return true;
  try{
   const res=await fetchImpl('https://api.github.com/repos/'+repository+'/issues/'+issue,{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
   if(!res.ok)return true;
   const d=await res.json();
   const marker='<!-- aca-stage1:enable:'+configSha+' -->';
   const lines=typeof d.body==='string'?d.body.split(/\r?\n/):[];
   const controls=lines.filter(line=>line.includes('<!-- aca-stage1:'));
   const labels=Array.isArray(d.labels)?d.labels.map(l=>String(l.name||'').toLowerCase()):[];
   return d.number!==issue||d.pull_request!=null||d.state!=='open'||!labels.includes('aca:auto/blocked')||labels.some(l=>['aca:stage1/stop','aca:stage1/enabled','aca:auto/docs-test'].includes(l))||controls.length!==1||controls[0]!==marker;
  }catch{return true;}
 };
}
module.exports={stopReader};
