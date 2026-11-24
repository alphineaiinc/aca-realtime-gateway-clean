'use strict';
const validScope=s=>s&&typeof s.product==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(s.product)&&typeof s.repository==='string'&&s.repository.length<=200&&s.repository.split('/').length===2&&s.repository.split('/').every(part=>/^[A-Za-z0-9_.-]+$/.test(part))&&typeof s.sha==='string'&&/^[a-f0-9]{40}$/.test(s.sha);
function createGovernanceAlertReader({pool,scope,authenticate}={}){
 if(typeof pool?.query!=='function'||typeof authenticate!=='function'||!validScope(scope))throw Error('Invalid governance alert reader');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 async function identity(credential){
  const actor=await authenticate(credential);
  if(!actor||actor.permission!=='queue.manage'||actor.role!==undefined||actor.product!==pinned.product||actor.repository!==pinned.repository||actor.sha!==pinned.sha||typeof actor.id!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(actor.id))throw Error('Governance alert identity denied');
  return actor.id;
 }
 function checkLimit(limit){if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid alert limit');}
 const scoped=[pinned.product,pinned.repository];
 const freezeRows=result=>Object.freeze(result.rows.map(row=>Object.freeze({...row})));
 return Object.freeze({
  async list({credential,limit=25}={}){
   checkLimit(limit);await identity(credential);
   return freezeRows(await pool.query('SELECT id,event_type,role,actor_id,approval_id,created_at FROM engineering_team_governance_alerts WHERE product=$1 AND repository=$2 ORDER BY created_at DESC,id DESC LIMIT $3',[...scoped,limit]));
  },
  async backlog({credential,limit=25}={}){
   checkLimit(limit);await identity(credential);
   return freezeRows(await pool.query('SELECT a.id,a.event_type,a.role,a.actor_id,a.approval_id,a.created_at FROM engineering_team_governance_alerts a WHERE a.product=$1 AND a.repository=$2 AND NOT EXISTS(SELECT 1 FROM engineering_team_governance_acknowledgements k WHERE k.alert_id=a.id) ORDER BY a.created_at,a.id LIMIT $3',[...scoped,limit]));
  },
  async acknowledge({credential,alertId}={}){
   if(typeof alertId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(alertId))throw Error('Invalid alert ID');
   if(typeof pool.connect!=='function')throw Error('Transactional alert pool required');
   const actor=await identity(credential);
   const client=await pool.connect();let discard=false;
   try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(scoped)]);
    if(await identity(credential)!==actor)throw Error('Governance alert identity denied');
    const target=await client.query('SELECT id FROM engineering_team_governance_alerts WHERE product=$1 AND repository=$2 AND id=$3',[...scoped,alertId]);
    if(target.rowCount!==1)throw Error('Governance alert unavailable');
    const result=await client.query('INSERT INTO engineering_team_governance_acknowledgements(alert_id,acknowledged_by) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING alert_id',[alertId,actor]);
    await client.query('COMMIT');
    return Object.freeze({acknowledged:true,newAcknowledgement:result.rowCount===1,executionAuthorized:false});
   }catch(e){try{await client.query('ROLLBACK');}catch{discard=true;}throw e;}finally{client.release(discard);}
  }
 });
}
module.exports={createGovernanceAlertReader};
