'use strict';
const {createPatchPlanner}=require('./patchPlanner');
const {createCorrectionLoop}=require('./correctionLoop');
function createCorrectionRuntime({scope,files,role,requiredChecks,runIsolated,proposeEdits,authorize,maxAttempts=2}={}){
 if(!['backend-developer','frontend-developer'].includes(role)||typeof runIsolated!=='function'||typeof proposeEdits!=='function'||!Array.isArray(requiredChecks)||!requiredChecks.length||requiredChecks.length>10||new Set(requiredChecks).size!==requiredChecks.length||requiredChecks.some(c=>typeof c!=='string'||!/^[a-z0-9-]{1,60}$/.test(c)))throw Error('Invalid correction runtime');
 const planner=createPatchPlanner({scope,files});
 const checks=Object.freeze([...requiredChecks]);
 const make=edits=>planner.plan({role,edits});
 const loop=createCorrectionLoop({scope,authorize,maxAttempts,
  propose:async input=>make(await proposeEdits(input)),
  verify:async plan=>{
   const report=await runIsolated(Object.freeze({plan,checks,profile:'disposable-no-network-no-secrets',timeoutSeconds:30}));
   if(!report||report.evidenceSha256!==plan.evidenceSha256||report.profile!=='disposable-no-network-no-secrets'||!Array.isArray(report.checks)||report.checks.length!==checks.length||checks.some(name=>report.checks.filter(c=>c?.name===name&&['passed','failed'].includes(c.status)).length!==1))return null;
   const failed=report.checks.filter(c=>c.status==='failed');
   const category=failed.every(c=>c.name==='syntax')?'syntax-failure':failed.every(c=>c.name==='node-tests'||c.name==='syntax')?'test-failure':'blocked';
   return Object.freeze({evidenceSha256:plan.evidenceSha256,profile:report.profile,status:failed.length?'failed':'passed',category});
  }
 });
 return Object.freeze({run:({edits}={})=>loop.run({plan:make(edits)}),stop:loop.stop,executionAllowed:()=>false});
}
module.exports={createCorrectionRuntime};
