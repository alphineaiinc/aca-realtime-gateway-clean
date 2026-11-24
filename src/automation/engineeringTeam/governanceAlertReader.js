'use strict';
const validScope=s=>s&&typeof s.product==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(s.product)&&typeof s.repository==='string'&&/^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$/.test(s.repository)&&s.repository.length<=200&&typeof s.sha==='string'&&/^[a-f0-9]{40}$/.test(s.sha);
function createGovernanceAlertReader({pool,scope,authenticate}={}){
 if(typeof pool?.query!=='function'||typeof authenticate!=='function'||!validScope(scope))throw Error('Invalid governance alert reader');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 return Object.freeze({async list({credential,limit=25}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid alert limit');
  const actor=await authenticate(credential);
  if(!actor||actor.permission!=='queue.manage'||actor.role!==undefined||actor.product!==pinned.product||actor.repository!==pinned.repository||actor.sha!==pinned.sha||typeof actor.id!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(actor.id))throw Error('Governance alert identity denied');
  const result=await pool.query('SELECT id,event_type,role,actor_id,approval_id,created_at FROM engineering_team_governance_alerts WHERE product=$1 AND repository=$2 ORDER BY created_at DESC,id DESC LIMIT $3',[pinned.product,pinned.repository,limit]);
  return Object.freeze(result.rows.map(row=>Object.freeze({...row})));
 }});
}
module.exports={createGovernanceAlertReader};
