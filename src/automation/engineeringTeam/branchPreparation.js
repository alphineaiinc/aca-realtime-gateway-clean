'use strict';
const {digest,createPatchPlanner}=require('./patchPlanner');
// Prepare an immutable branch/commit specification; no GitHub writes.
// Revalidate every replacement against the trusted pinned inventory.
function prepareBranch({scope,files,plan}={}){
 const planner=createPatchPlanner({scope,files});
 if(!plan||plan.executionAuthorized!==false||JSON.stringify(plan.scope)!==JSON.stringify({product:scope.product,repository:scope.repository,sha:scope.sha})||!Array.isArray(plan.changes))throw Error('Branch plan denied');
 const verified=planner.plan({role:plan.role,edits:plan.changes.map(({path,beforeSha256,replacement})=>({path,beforeSha256,replacement}))});
 if(verified.evidenceSha256!==plan.evidenceSha256)throw Error('Patch digest denied');
 const payload={scope:verified.scope,branch:'aca-agent-draft-'+verified.evidenceSha256.slice(0,16),parentSha:scope.sha,patchDigest:verified.evidenceSha256,files:verified.changes.map(c=>Object.freeze({path:c.path,mode:'100644',type:'blob',content:c.replacement}))};
 Object.freeze(payload.files);
 return Object.freeze({...payload,binding:digest(JSON.stringify(payload)),executionAuthorized:false});
}
module.exports={prepareBranch};
