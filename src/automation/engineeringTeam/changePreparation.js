'use strict';
const {createPatchPlanner}=require('./patchPlanner');
const {createDeveloperPatchAdapter}=require('./developerPatchAdapter');
const {createIsolatedTestAdapter}=require('./isolatedTestAdapter');
const {preparePublicationRequest}=require('./publicationRequest');
const {prepareBranch}=require('./branchPreparation');
// Offline preparation only: no GitHub mutation, live provider or runner defaults.
function createChangePreparation({scope,files,generate,runIsolated,reviewPatch,authorize,requiredChecks}={}){
 if(typeof reviewPatch!=='function'||typeof authorize!=='function')throw Error('Invalid preparation configuration');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 const inventory=Object.freeze(files.map(f=>Object.freeze({path:f.path,role:f.role,text:f.text})));
 const planner=createPatchPlanner({scope:pinned,files:inventory});
 const developer=createDeveloperPatchAdapter({generate,planner,files:inventory});
 const tester=createIsolatedTestAdapter({runIsolated,authorize,requiredChecks});
 let consumed=false;
 return Object.freeze({async prepare({role,subject}={}){
  if(!['backend-developer','frontend-developer'].includes(role)||typeof subject!=='string'||!subject.trim()||subject.length>2000||consumed)throw Error('Preparation denied');
  if(await authorize({scope:pinned,role,action:'patch.simulate'})!==true||consumed)throw Error('Preparation denied');
  consumed=true;
  const plan=await developer.propose({role,subject});
  const verification=await tester.verify(plan);
  if(await authorize({scope:pinned,role:'security-reviewer',action:'review.simulate',evidenceSha256:plan.evidenceSha256})!==true)throw Error('Review denied');
  const raw=await reviewPatch(Object.freeze({plan,verification,mode:'offline-review-only'}));
  if(!raw||raw.role!=='security-reviewer'||raw.disposition!=='recommend-review'||raw.evidenceSha256!==plan.evidenceSha256)throw Error('Review evidence denied');
  const review=Object.freeze({role:raw.role,disposition:raw.disposition,evidenceSha256:raw.evidenceSha256});
  const request=preparePublicationRequest({plan,verification,review});
  const branch=prepareBranch({scope:pinned,files:inventory,plan});
  return Object.freeze({plan,verification,review,request,branch,mode:'offline-preparation-only',releaseApproved:false,executionAuthorized:false});
 }});
}
module.exports={createChangePreparation};
