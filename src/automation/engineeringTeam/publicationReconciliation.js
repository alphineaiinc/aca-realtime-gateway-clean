'use strict';
// Read-only classifier. Observations must come from an independently trusted
// collector. Absence is never permission to retry an ambiguous write.
function reconcilePublication({binding,repository,baseBranch,headBranch,baseSha,headSha,observations,complete}={}){
 if(typeof binding!=='string'||!/^[a-f0-9]{64}$/.test(binding)||typeof repository!=='string'||typeof baseBranch!=='string'||typeof headBranch!=='string'||![baseSha,headSha].every(s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s)))throw Error('Invalid reconciliation scope');
 const result=(state,number=null)=>Object.freeze({binding,state,number,retryAuthorized:false,executionAuthorized:false});
 if(complete!==true||!Array.isArray(observations))return result('unresolved');
 const candidates=observations.filter(p=>p?.body==='Evidence binding: '+binding||p?.head?.ref===headBranch);
 if(candidates.length!==1)return result('unresolved');
 const p=candidates[0];
 if(p.body!=='Evidence binding: '+binding||p.draft!==true||p.state!=='open'||p.base?.repo?.full_name!==repository||p.head?.repo?.full_name!==repository||p.base.ref!==baseBranch||p.head.ref!==headBranch||p.base.sha!==baseSha||p.head.sha!==headSha||!Number.isSafeInteger(p.number)||p.number<1)return result('unresolved');
 return result('observed-draft',p.number);
}
module.exports={reconcilePublication};
