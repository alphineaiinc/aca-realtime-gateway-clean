'use strict';
const {getRole}=require('./registry');
const {createQueueDrain}=require('./queueDrain');
// Independent queued tasks only; does not bypass sequential workflow handoffs.
function createMultiWorkerDrain({scope,workers,authenticate,maxSteps=8}={}){
 if(!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||!/^[a-f0-9]{40}$/.test(scope.sha)||typeof authenticate!=='function'||!Array.isArray(workers)||workers.length<1||workers.length>2)throw Error('Invalid worker coordination');
 const pinned=Object.freeze({...scope});
 const roles=new Set(),credentials=new Set();
 const entries=workers.map(({role,credential,worker})=>{
  getRole(role);
  if(roles.has(role)||typeof credential!=='string'||!credential||credentials.has(credential))throw Error('Duplicate worker identity');
  roles.add(role);credentials.add(credential);
  return Object.freeze({role,credential,drain:createQueueDrain({worker,maxSteps})});
 });
 let active=false,stopped=false;
 function stop(){stopped=true;for(const e of entries)e.drain.stop();}
 return Object.freeze({
  stop,executionAllowed:()=>false,
  async run(){
   if(active||stopped)throw Error('Coordination unavailable');
   active=true;
   try{
    const actors=await Promise.all(entries.map(e=>authenticate(e.credential)));
    if(stopped||actors.some((a,i)=>!a||a.permission!=='queue.work'||a.role!==entries[i].role||a.product!==pinned.product||a.repository!==pinned.repository||a.sha!==pinned.sha||typeof a.id!=='string'||!a.id)||new Set(actors.map(a=>a.id)).size!==actors.length)return Object.freeze({state:'denied',releaseApproved:false});
    const settled=await Promise.allSettled(entries.map(async e=>{
     try{
      const result=await e.drain.run({scope:pinned,role:e.role,credential:e.credential});
      if(result.reason==='failed')stop();
      return Object.freeze({role:e.role,...result});
     }catch(err){stop();throw err;}
    }));
    const results=Object.freeze(settled.map((s,i)=>s.status==='fulfilled'?s.value:Object.freeze({role:entries[i].role,reason:'unknown'})));
    const state=results.some(r=>r.reason==='failed'||r.reason==='unknown')?'failed':stopped?'stopped':results.some(r=>r.reason==='limit')?'limit':'idle';
    return Object.freeze({state,results,releaseApproved:false});
   }finally{active=false;}
  }
 });
}
module.exports={createMultiWorkerDrain};
