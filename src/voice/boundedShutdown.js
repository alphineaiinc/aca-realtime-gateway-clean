'use strict';
function createShutdown({stop,close,snapshot,end,exit,timeoutMs=10000}) {
 let running;
 return function shutdown(){
  if(running)return running;
  running=Promise.resolve().then(async()=>{
   const timer=setTimeout(()=>exit(1),timeoutMs);
   try {
    const drain=Promise.resolve().then(stop);
    const closed=Promise.resolve().then(close);
    const results=await Promise.allSettled([drain,closed]);
    if(results.some(r=>r.status==='rejected'))throw Error('SHUTDOWN_DRAIN_FAILED');
    await snapshot(); await end(); clearTimeout(timer); exit(0);
   } catch {clearTimeout(timer);exit(1);}
  });
  return running;
 };
}
module.exports={createShutdown};
