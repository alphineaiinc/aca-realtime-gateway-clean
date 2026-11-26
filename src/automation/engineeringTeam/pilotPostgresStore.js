'use strict';
// Dedicated preparation-only ledger. Never use a production pool.
// Schema installation is intentionally external; no DDL on initialization.
function createPilotPostgresStore({pool}={}){
 if(typeof pool?.connect!=='function')throw Error('Isolated transactional pool required');
 return Object.freeze({async transact(runId,fn){
 if(typeof runId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(runId)||typeof fn!=='function')throw Error('Invalid preparation transaction');
 const client=await pool.connect();let broken=false;
 try{
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',['sg001-preparation-v1',runId]);
 const tx=Object.freeze({
 async read(){const r=await client.query('SELECT receipt FROM sg001_pilot_preparation WHERE run_id=$1',[runId]);return r.rows[0]?.receipt??null;},
 async insert(r){
 if(r?.runId!==runId||r.domain!=='sg001-pilot-preparation-record-v1'||r.status!=='recorded-preparation'||r.executionAuthorized!==false||r.releaseAuthorized!==false||typeof r.binding!=='string'||!/^[a-f0-9]{64}$/.test(r.binding))throw Error('Invalid non-authorizing receipt');
 const q=await client.query('INSERT INTO sg001_pilot_preparation(run_id,binding,receipt) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[runId,r.binding,JSON.stringify(r)]);return q.rowCount===1;
 }});
 const result=await fn(tx);await client.query('COMMIT');return result;
 }catch(e){try{await client.query('ROLLBACK');}catch{broken=true;}throw e;}finally{client.release(broken);}
 }});
}
module.exports={createPilotPostgresStore};
