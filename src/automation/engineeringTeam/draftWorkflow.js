'use strict';
const {digest}=require('./patchPlanner');
// Trusted fixture runner only. No shell, filesystem, git or network operations.
function createDraftWorkflow({planner,runFixtureTests,authorize}={}){
 if(typeof planner?.plan!=='function'||typeof runFixtureTests!=='function'||typeof authorize!=='function')throw Error('Invalid workflow configuration');
 return Object.freeze({async prepare({role,edits}){
  const plan=planner.plan({role,edits});
  if(await authorize({scope:plan.scope,role,action:'patch.simulate'})!==true)throw Error('Workflow denied');
  const result=await runFixtureTests(plan);
  if(!result||result.evidenceSha256!==plan.evidenceSha256||!Array.isArray(result.checks)||!result.checks.length||result.checks.length>20||result.checks.some(c=>typeof c.name!=='string'||c.name.length>100||c.status!=='passed'))throw Error('Fixture validation failed');
  const checks=Object.freeze(result.checks.map(c=>Object.freeze({name:c.name,status:'passed'})));
  const draft=Object.freeze({baseSha:plan.scope.sha,repository:plan.scope.repository,title:'Engineering proposal: '+role,changes:plan.changes,checks,provenance:'offline-fixture-only',draft:true,writeAuthorized:false});
  return Object.freeze({plan,draft,evidenceSha256:digest(JSON.stringify(draft)),releaseApproved:false});
 }});
}
module.exports={createDraftWorkflow};
