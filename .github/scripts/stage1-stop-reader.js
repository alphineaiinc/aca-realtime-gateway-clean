'use strict';
const repository='alphineaiinc/aca-realtime-gateway-clean', sha='6678909c7e9e60c08b0bc56c150e9031900a3984', issue=118;
function stopReader(token,fetchImpl=globalThis.fetch){
 return async scope=>{
  if(scope.repository!==repository||scope.sha!==sha||scope.product!=='aca')return true;
  try{
   const res=await fetchImpl('https://api.github.com/repos/'+repository+'/issues/'+issue,{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
   if(!res.ok)return true;
   const d=await res.json();
   return d.number!==issue||d.state!=='open'||!Array.isArray(d.labels)||!d.labels.some(l=>l.name==='aca:stage1/enabled')||d.labels.some(l=>['aca:stage1/stop','aca:auto/blocked'].includes(l.name));
  }catch{return true;}
 };
}
module.exports={stopReader};
