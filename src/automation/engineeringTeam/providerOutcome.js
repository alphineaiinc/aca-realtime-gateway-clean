'use strict';
// Fixture evidence only; no provider billing verification or execution grant.
function createProviderOutcome({pool,scope,authenticate}={}){
 if(typeof pool?.connect!=='function'||typeof authenticate!=='function'||!scope?.product||!scope?.repository||! /^[a-f0-9]{40}$/.test(scope.sha))throw Error('Invalid outcome configuration');
 const pinned=Object.freeze({...scope});
 const allowed=a=>a&&typeof a.id==='string'&&a.permission==='queue.manage'&&a.role===undefined&&a.product===pinned.product&&a.repository===pinned.repository&&a.sha===pinned.sha;
 return Object.freeze({async record({credential,binding,usage=null}={}){
  if(typeof binding!=='string'||! /^[a-f0-9]{64}$/.test(binding))throw Error('Outcome denied');
  const u=usage===null?null:structuredClone(usage);
  if(u!==null&&(!u||![u.inputTokens,u.outputTokens,u.actualMicrousd].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=2147483647)))throw Error('Invalid usage');
  const actor=await authenticate(credential);if(!allowed(actor))throw Error('Outcome denied');
  const actorId=actor.id;
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([pinned.product,pinned.repository])]);
   const fresh=await authenticate(credential);if(!allowed(fresh)||fresh.id!==actorId)throw Error('Outcome denied');
   const attempt=await client.query('SELECT reserved_microusd FROM engineering_team_provider_attempts WHERE binding=$1 AND product=$2 AND repository=$3 AND head_sha=$4',[binding,pinned.product,pinned.repository,pinned.sha]);
   if(attempt.rowCount!==1)throw Error('Outcome denied');
   const outcome=u===null?'unknown':BigInt(u.actualMicrousd)>BigInt(attempt.rows[0].reserved_microusd)?'breach':'completed';
   const result=await client.query('INSERT INTO engineering_team_provider_outcomes(binding,outcome,input_tokens,output_tokens,actual_microusd,recorded_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING binding',[binding,outcome,u?.inputTokens??null,u?.outputTokens??null,u?.actualMicrousd??null,actorId]);
   if(result.rowCount!==1)throw Error('Outcome already recorded');
   if(outcome!=='completed')await client.query('INSERT INTO engineering_team_stops(product,repository,actor_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[pinned.product,pinned.repository,actorId]);
   await client.query('COMMIT');
   return Object.freeze({outcome,executionAuthorized:false});
  }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}finally{client.release(discard);}
 }});
}
module.exports={createProviderOutcome};
