'use strict';
const {createRestrictedManager}=require('./restrictedManager');
const {createGitHubReadTransport}=require('./githubReadTransport');
// A separate composition root. No mutable queue, worker, database writer,
// scheduler, provider, credential issuer or publication client is constructed.
function createRestrictedManagerRuntime({scope,issue,githubToken,fetchImpl,readOnlyPool,readStopState}={}){
 const pinned=Object.freeze({...scope});
 const transport=createGitHubReadTransport({token:githubToken,repository:pinned.repository,fetchImpl});
 if(readOnlyPool!==undefined&&typeof readOnlyPool?.connect!=='function')throw Error('Read-only pool required');
 const readAlertSummary=readOnlyPool===undefined?undefined:async s=>{
  if(s.product!==pinned.product||s.repository!==pinned.repository||s.sha!==pinned.sha)throw Error('Alert scope denied');
  const client=await readOnlyPool.connect();
  try{
   await client.query('BEGIN READ ONLY');
   await client.query("SET LOCAL statement_timeout = '3000ms'");
   const mode=await client.query('SHOW transaction_read_only');
   if(mode.rows?.[0]?.transaction_read_only!=='on')throw Error('Read-only transaction denied');
   const result=await client.query('SELECT count(*)::int AS pending FROM (SELECT a.id FROM engineering_team_governance_alerts a WHERE a.product=$1 AND a.repository=$2 AND NOT EXISTS (SELECT 1 FROM engineering_team_governance_acknowledgements k WHERE k.alert_id=a.id) LIMIT 101) AS pending_alerts',[pinned.product,pinned.repository]);
  const n=result.rows?.[0]?.pending;
  if(!Number.isSafeInteger(n)||n<0||n>101)throw Error('Alert count denied');
   await client.query('COMMIT');
   return Object.freeze({...pinned,pending:Math.min(n,100),partial:n>100});
  }catch(e){try{await client.query('ROLLBACK');}catch{}throw e;}finally{client.release(true);}
 };
 if(readStopState!==undefined&&typeof readStopState!=='function')throw Error('Invalid stop reader');
 const manager=createRestrictedManager({scope:pinned,issue,transport,readAlertSummary});
 return Object.freeze({async observe(){
  const denied=()=>Object.freeze({scope:pinned,issue,status:'unavailable',executionAuthorized:false,writeAuthorized:false,deployAuthorized:false,paidProviderAuthorized:false});
  try{
   if(!readStopState||await readStopState(pinned)!==false)return denied();
   const result=await manager.observe();
   if(await readStopState(pinned)!==false)return denied();
   return result;
  }catch{return denied();}
 }});
}
module.exports={createRestrictedManagerRuntime};
