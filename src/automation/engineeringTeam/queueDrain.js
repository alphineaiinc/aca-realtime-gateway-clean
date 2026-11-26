'use strict';
// Explicitly invoked offline worker drain. Durable queue owns leases and retries.
// No timers, provider clients, credentials discovery, or automatic activation.
function createQueueDrain({worker,maxSteps=8}={}){
 if(typeof worker?.runOnce!=='function'||!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>32)throw Error('Invalid drain configuration');
 let active=false,stopped=false;
 return Object.freeze({
  stop(){stopped=true;},
  async run(input){
   if(active||stopped)throw Error('Drain unavailable');
   if(!input?.scope||typeof input.role!=='string'||input.expectedTaskId!==undefined)throw Error('Invalid drain input');
   const request=Object.freeze({scope:Object.freeze({...input.scope}),role:input.role,credential:input.credential});
   active=true;
   const counts={succeeded:0,retried:0,failed:0};
   try{
    for(let i=0;i<maxSteps;i++){
     if(stopped)return Object.freeze({...counts,reason:'stopped'});
     const result=await worker.runOnce(request);
     if(result?.state==='idle')return Object.freeze({...counts,reason:'idle'});
     if(result?.releaseApproved!==false)throw Error('Unexpected worker result');
     if(result.state==='succeeded')counts.succeeded++;
     else if(result.state==='queued')counts.retried++;
     else if(result.state==='failed'){counts.failed++;return Object.freeze({...counts,reason:'failed'});}
     else throw Error('Unexpected worker state');
    }
    return Object.freeze({...counts,reason:stopped?'stopped':'limit'});
   }finally{active=false;}
  }
 });
}
module.exports={createQueueDrain};
