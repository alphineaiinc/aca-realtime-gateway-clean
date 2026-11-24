'use strict';
const {createPatchPlanner}=require('./patchPlanner');
const {createCorrectionLoop}=require('./correctionLoop');
function createCorrectionRuntime({scope,files,role,requiredChecks,runIsolated,proposeEdits,authorize,admitCycle,maxAttempts=2}={}){
 if(typeof admitCycle!=='function'||!['backend-developer','frontend-developer'].includes(role)||typeof runIsolated!=='function'||typeof proposeEdits!=='function'||!Array.isArray(requiredChecks)||!requiredChecks.length||requiredChecks.length>10||new Set(requiredChecks).size!==requiredChecks.length||requiredChecks.some(c=>typeof c!=='string'||!/^[a-z0-9-]{1,60}$/.test(c)))throw Error('Invalid correction runtime');
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
 let started=false,stopped=false;
 return Object.freeze({async run({edits,taskId}={}){
  if(started||stopped)throw Error('Correction unavailable');
  const plan=make(edits);started=true;
  if(await admitCycle({taskId,initialDigest:plan.evidenceSha256})!==true||stopped)return Object.freeze({state:'denied',attempts:0,releaseApproved:false});
  return loop.run({plan});
 },stop(){stopped=true;loop.stop();},executionAllowed:()=>false});
}
module.exports={createCorrectionRuntime};
