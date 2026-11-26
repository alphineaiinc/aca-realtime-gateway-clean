'use strict';
// Durable record of an authenticated stop instruction, not actual revocation.
const {createHash}=require('node:crypto');
const domain='sg001-pilot-stop-record-v1';
const deny=()=>Object.freeze({domain,status:'denied',executionAuthorized:false,releaseAuthorized:false});
function createPilotStopRecorder({pool,verifyEvidence,clock=Date.now}={}){
 if(typeof pool?.connect!=='function'||typeof verifyEvidence!=='function')throw Error('Trusted stop adapters required');
 return Object.freeze({async record({runId,envelope}={}){
 if(typeof runId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(runId))return deny();
 let c,broken=false;
 try{
 c=await pool.connect();await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',['sg001-preparation-v1',runId]);
 const r=(await c.query('SELECT receipt FROM sg001_pilot_preparation WHERE run_id=$1',[runId])).rows[0]?.receipt;
 if(!r||r.executionAuthorized!==false||r.releaseAuthorized!==false||!r.cleanup)throw Error('Missing preparation');
 const binding=createHash('sha256').update(JSON.stringify([domain,runId,r.binding,r.ownerId])).digest('hex');
 const e=await verifyEvidence(envelope,'stop',binding);
 if(!e||e.runId!==runId||e.preparationBinding!==r.binding||e.ownerId!==r.ownerId||e.stop!==true||!Number.isSafeInteger(e.observedAt)||e.observedAt>clock())throw Error('Stop evidence denied');
 const receipt=Object.freeze({domain,status:'stop-recorded',runId,binding,preparationBinding:r.binding,observedAt:e.observedAt,executionAuthorized:false,releaseAuthorized:false});
 const inserted=await c.query('INSERT INTO sg001_pilot_stop(run_id,binding,receipt) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[runId,binding,JSON.stringify(receipt)]);
 if(inserted.rowCount!==1)throw Error('Duplicate stop');
 await c.query('UPDATE sg001_pilot_evidence SET revoked=true WHERE run_id=$1',[runId]);
 await c.query('COMMIT');return receipt;
 }catch{if(c)try{await c.query('ROLLBACK');}catch{broken=true;}return deny();}finally{if(c)c.release(broken);}
 }});
}
module.exports={createPilotStopRecorder};
