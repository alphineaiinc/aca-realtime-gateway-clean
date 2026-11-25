'use strict';
const {createHmac,timingSafeEqual,createHash}=require('node:crypto');
// Trusted host supplies the secret; no listener or credential provisioning here.
function createAuthenticatedObservation({secret,scope,observeEvent}={}){
 if(!Buffer.isBuffer(secret)||secret.length<32||!scope||typeof scope.repository!=='string'||!/^[a-f0-9]{40}$/.test(scope.sha)||typeof observeEvent!=='function')throw Error('Invalid event configuration');
 const key=Buffer.from(secret),repository=scope.repository,sha=scope.sha;
 return async function deliver(raw,signature){
  if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>262144||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))throw Error('Event denied');
  const expected=createHmac('sha256',key).update(raw).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex')))throw Error('Event denied');
  const body=JSON.parse(raw.toString('utf8'));
  if(body.repository?.full_name!==repository||body.action!=='completed'||body.workflow_run?.head_sha!==sha||body.workflow_run?.event!=='push'||body.workflow_run?.status!=='completed'||!Number.isSafeInteger(body.workflow_run?.id)||body.workflow_run.id<1||!Number.isSafeInteger(body.workflow_run.run_attempt)||body.workflow_run.run_attempt<1)throw Error('Event scope denied');
  return observeEvent('run:'+body.workflow_run.id+':'+body.workflow_run.run_attempt);
 };
}
module.exports={createAuthenticatedObservation};
