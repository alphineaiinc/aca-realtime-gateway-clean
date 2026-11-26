'use strict';
// Records verified teardown evidence only. Does not stop, revoke or delete resources.
const {createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const domain='sg001-pilot-teardown-record-v1';
const denied=()=>Object.freeze({domain,status:'denied',executionAuthorized:false,releaseAuthorized:false});
function createPilotTeardownRecorder({pool,verifyEvidence,clock=Date.now}={}){
 if(typeof pool?.connect!=='function'||typeof verifyEvidence!=='function')throw Error('Trusted teardown adapters required');
 return Object.freeze({async record({runId,envelope}={}){
 if(typeof runId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(runId))return denied();
 let c,broken=false;
 try{
 c=await pool.connect();await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',['sg001-preparation-v1',runId]);
 const r=(await c.query('SELECT receipt FROM sg001_pilot_preparation WHERE run_id=$1',[runId])).rows[0]?.receipt;
 if(!r||r.domain!=='sg001-pilot-preparation-record-v1'||r.executionAuthorized!==false||r.releaseAuthorized!==false)throw Error('Unknown preparation');
 const binding=hash([domain,runId,r.binding]);
 const evidence=await verifyEvidence(envelope,'teardown',binding);
 if(!evidence||evidence.runId!==runId||evidence.preparationBinding!==r.binding||evidence.stopped!==true||evidence.accessRevoked!==true||evidence.resourceRemoved!==true||evidence.independentlyObserved!==true||typeof evidence.observationDigest!=='string'||!/^[a-f0-9]{64}$/.test(evidence.observationDigest)||!Number.isSafeInteger(evidence.observedAt)||evidence.observedAt>clock())throw Error('Unverified cleanup');
 const receipt=Object.freeze({domain,status:'cleanup-evidence-recorded',runId,binding,observationDigest:evidence.observationDigest,executionAuthorized:false,releaseAuthorized:false});
 const inserted=await c.query('INSERT INTO sg001_pilot_teardown(run_id,binding,receipt) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[runId,binding,JSON.stringify(receipt)]);
 if(inserted.rowCount!==1)throw Error('Duplicate cleanup evidence');
 await c.query('COMMIT');return receipt;
 }catch{if(c)try{await c.query('ROLLBACK');}catch{broken=true;}return denied();}finally{if(c)c.release(broken);}
 }});
}
module.exports={createPilotTeardownRecorder};
