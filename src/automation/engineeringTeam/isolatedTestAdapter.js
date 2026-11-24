'use strict';
// Transport contract for a separately provisioned isolated runner. The runner
// must enforce its own isolation; this module never executes generated code.
const {digest}=require('./patchPlanner');
function createIsolatedTestAdapter({runIsolated,authorize,requiredChecks}={}){
 if(typeof runIsolated!=='function'||typeof authorize!=='function'||!Array.isArray(requiredChecks)||!requiredChecks.length||requiredChecks.length>10||new Set(requiredChecks).size!==requiredChecks.length||requiredChecks.some(x=>typeof x!=='string'||! /^[a-z0-9-]{1,60}$/.test(x)))throw Error('Invalid test adapter');
 const checks=Object.freeze([...requiredChecks]);
 return Object.freeze({async verify(plan){
  if(!plan||!Array.isArray(plan.changes)||plan.executionAuthorized!==false||plan.evidenceSha256!==digest(JSON.stringify({scope:plan.scope,role:plan.role,changes:plan.changes})))throw Error('Patch evidence denied');
  if(await authorize({scope:plan.scope,role:plan.role,action:'test.simulate',evidenceSha256:plan.evidenceSha256})!==true)throw Error('Test authorization denied');
  const result=await runIsolated(Object.freeze({plan,checks,profile:'disposable-no-network-no-secrets',timeoutSeconds:30}));
  if(!result||result.evidenceSha256!==plan.evidenceSha256||result.profile!=='disposable-no-network-no-secrets'||!Array.isArray(result.checks)||result.checks.length!==checks.length||checks.some(name=>result.checks.filter(c=>c.name===name&&c.status==='passed').length!==1))throw Error('Test evidence denied');
  return Object.freeze({evidenceSha256:plan.evidenceSha256,checks:Object.freeze(checks.map(name=>Object.freeze({name,status:'passed'}))),provenance:'unverified-runner-report',executionAuthorized:false});
 }});
}
module.exports={createIsolatedTestAdapter};
