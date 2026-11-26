'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
// Transport boundary only; no listener, default secret or live dispatch.
function createCiCompletionEvent({secret,repository,workflowId,runtime}={}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32||typeof repository!=='string'||!Number.isSafeInteger(workflowId)||workflowId<1||typeof runtime?.onCompletion!=='function')throw Error('Invalid event adapter configuration');
 return async function handle({body,signature,eventType}={}){
  if(!Buffer.isBuffer(body)||body.length>1048576||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))return Object.freeze({state:'denied'});
  const expected=createHmac('sha256',secret).update(body).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex')))return Object.freeze({state:'denied'});
  if(eventType!=='workflow_run')return Object.freeze({state:'ignored'});
  let event;try{event=JSON.parse(body.toString('utf8'));}catch{return Object.freeze({state:'denied'});}
  const run=event?.workflow_run;
  if(event?.action!=='completed'||event.repository?.full_name!==repository||run?.workflow_id!==workflowId||run.status!=='completed'||run.conclusion!=='success'||!Number.isSafeInteger(run.id)||run.id<1||!Number.isSafeInteger(run.run_attempt)||run.run_attempt<1)return Object.freeze({state:'ignored'});
  // Runtime independently reads trusted run evidence and admits durable receipt.
  return runtime.onCompletion({runId:run.id,attempt:run.run_attempt});
 };
}
module.exports={createCiCompletionEvent};
