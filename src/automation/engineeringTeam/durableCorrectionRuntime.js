'use strict';
const {createCorrectionAdmission}=require('./correctionAdmission');
const {createCorrectionRuntime}=require('./correctionRuntime');
// Composition only: all provider, runner, and reviewer capabilities are injected.
function createDurableCorrectionRuntime({pool,scope,authenticate,managerCredential,files,role,requiredChecks,runIsolated,proposeEdits,authorize,reviewCandidate,maxAttempts=2}={}){
 if(typeof managerCredential!=='string'||!managerCredential)throw Error('Manager credential required');
 const admitCycle=createCorrectionAdmission({pool,scope,authenticate,credential:managerCredential});
 const runtime=createCorrectionRuntime({scope,files,role,requiredChecks,runIsolated,proposeEdits,authorize,admitCycle,reviewCandidate,maxAttempts});
 let consumed=false;
 return Object.freeze({
  async run({taskId,edits}={}){
   if(consumed)throw Error('Correction runtime consumed');
   consumed=true;
   return runtime.run({taskId,edits});
  },
  stop(){runtime.stop();},
  executionAllowed:()=>false
 });
}
module.exports={createDurableCorrectionRuntime};
