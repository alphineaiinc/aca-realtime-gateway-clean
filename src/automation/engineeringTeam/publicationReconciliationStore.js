'use strict';
const {reconcilePublication}=require('./publicationReconciliation');
// Offline only. Requires an independently authenticated observation collector.
// No retry, live admission, or publication authority is returned.
function createReconciliationStore({pool,authenticate,collect}={}){
 if(typeof pool?.connect!=='function'||typeof authenticate!=='function'||typeof collect!=='function')throw Error('Invalid reconciliation store');
 return Object.freeze({async record({credential,binding}={}){
 if(typeof binding!=='string'||!/^[a-f0-9]{64}$/.test(binding))throw Error('Invalid binding');
 const actor=await authenticate(credential);
 if(!actor||actor.permission!=='queue.manage'||actor.role!==undefined||typeof actor.id!=='string')throw Error('Reconciliation denied');
 const client=await pool.connect();let discard=false;
 try{
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([actor.product,actor.repository])]);
 const fresh=await authenticate(credential);
 if(!fresh||fresh.id!==actor.id||fresh.permission!=='queue.manage'||fresh.role!==undefined||fresh.product!==actor.product||fresh.repository!==actor.repository||fresh.sha!==actor.sha)throw Error('Reconciliation denied');
 const reservation=await client.query('SELECT binding FROM engineering_team_publication_attempts WHERE binding=$1 AND product=$2 AND repository=$3 AND base_sha=$4 AND reserved_by=$5 FOR UPDATE',[binding,actor.product,actor.repository,actor.sha,actor.id]);
 if(reservation.rowCount!==1)throw Error('Reconciliation denied');
 const observation=await collect(Object.freeze({binding,repository:actor.repository,baseSha:actor.sha}));
 const result=reconcilePublication({...observation,binding,repository:actor.repository,baseSha:actor.sha});
 // Append-only evidence; never releases the reservation.
 await client.query('INSERT INTO engineering_team_publication_reconciliation(binding,observed_by,state,pr_number) VALUES ($1,$2,$3,$4)',[binding,actor.id,result.state,result.number]);
 await client.query('COMMIT');return result;
 }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}finally{client.release(discard);}
 }});
}
module.exports={createReconciliationStore};
