'use strict';
const {verify,createHash,createPublicKey}=require('node:crypto');
// Offline verifier only. Trust keys must be supplied by independent custody.
function authenticate(envelope,keys,expected,now){
 if(!Number.isSafeInteger(now)||!envelope||typeof envelope.payload!=='string'||typeof envelope.signature!=='string'||!Object.hasOwn(keys,envelope.keyId))throw Error('Untrusted evidence');
 const key=createPublicKey(keys[envelope.keyId]);
 if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(envelope.payload),key,Buffer.from(envelope.signature,'base64')))throw Error('Invalid signature');
 const p=JSON.parse(envelope.payload);
 if(!Number.isSafeInteger(p.issuedAt)||!Number.isSafeInteger(p.expiresAt)||p.issuedAt>now||p.expiresAt<=now||p.expiresAt<=p.issuedAt)throw Error('Stale evidence');
 for(const [k,v] of Object.entries(expected))if(p[k]!==v)throw Error('Evidence scope mismatch');
 return {payload:p,digest:createHash('sha256').update(envelope.payload).digest('hex')};
}
// Append-only settlement observation: never release reservations or authorize execution.
async function recordSettlement({pool,keys,envelope,month,id,clock=Date.now}){
 const client=await pool.connect();let discard=false;
 try{
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(172150,189)');
 const r=await client.query('SELECT state FROM da_monthly_budget_disabled WHERE month=$1 FOR UPDATE',[month]);
 if(r.rowCount!==1)throw Error('Missing ledger');
 const s=r.rows[0].state,e=s.entries.find(x=>x.id===id);
 if(!e||s.month!==month||s.reconciled!==true)throw Error('Missing reservation');
 const {payload:p,digest}=authenticate(envelope,keys,{kind:'settlement',month,id,reservationDigest:e.evidenceSha256,currency:'CAD'},clock());
 if(!Number.isSafeInteger(p.actualCents)||p.actualCents<0)throw Error('Invalid settlement');
 const records=s.settlementObservations||[];
 if(records.some(x=>x.id===id))throw Error('Settlement already recorded');
 const next={...s,reconciled:p.actualCents<=e.workCents+e.cleanupCents,settlementObservations:[...records,{id,digest,actualCents:p.actualCents}],executionAuthorized:false};
 const u=await client.query('UPDATE da_monthly_budget_disabled SET state=$2::jsonb WHERE month=$1',[month,JSON.stringify(next)]);if(u.rowCount!==1)throw Error('Update denied');
 await client.query('COMMIT');return {recorded:true,executionAuthorized:false};
 }catch(e){discard=true;try{await client.query('ROLLBACK');}catch{}throw e;}finally{client.release(discard);}
}
module.exports={authenticate,recordSettlement};
