'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {createCiCompletionEvent}=require('../src/automation/engineeringTeam/ciCompletionEvent');
const secret='fixture-only-secret-not-for-live-use';
const event={action:'completed',repository:{full_name:'fixture/aca'},workflow_run:{id:123,run_attempt:1,workflow_id:42,status:'completed',conclusion:'success'}};
const signed=(value=event)=>{const body=Buffer.from(JSON.stringify(value));return {body,signature:'sha256='+createHmac('sha256',secret).update(body).digest('hex'),eventType:'workflow_run'};};
test('signed completion reaches runtime with only run identity',async()=>{
 const handle=createCiCompletionEvent({secret,repository:'fixture/aca',workflowId:42,runtime:{async onCompletion(input){assert.deepEqual(input,{runId:123,attempt:1});return {state:'drained'};}}});
 assert.equal((await handle(signed())).state,'drained');
});
test('invalid signature, tampered body, and unrelated event never execute',async()=>{
 const handle=createCiCompletionEvent({secret,repository:'fixture/aca',workflowId:42,runtime:{onCompletion(){assert.fail('unexpected execution');}}});
 assert.equal((await handle({...signed(),signature:'sha256='+'0'.repeat(64)})).state,'denied');
 assert.equal((await handle({...signed(),body:Buffer.from('{}')})).state,'denied');
 assert.equal((await handle({...signed(),eventType:'push'})).state,'ignored');
 for(const patch of [{conclusion:'failure'},{status:'in_progress'},{workflow_id:43},{run_attempt:0}]){
  assert.equal((await handle(signed({...event,workflow_run:{...event.workflow_run,...patch}}))).state,'ignored');
 }
 assert.equal((await handle(signed({...event,repository:{full_name:'other/aca'}}))).state,'ignored');
});
