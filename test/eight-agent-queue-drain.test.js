'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createQueueDrain}=require('../src/automation/engineeringTeam/queueDrain');
const input={scope:{product:'aca',repository:'owner/repo',sha:'a'.repeat(40)},role:'devops',credential:'fixture'};
const result=state=>({state,releaseApproved:false});
test('drains eligible tasks immediately until idle',async()=>{
 const states=['succeeded','queued','succeeded','idle'];
 const drain=createQueueDrain({worker:{async runOnce(req){assert.deepEqual(req,input);return result(states.shift());}}});
 assert.deepEqual(await drain.run(input),{succeeded:2,retried:1,failed:0,reason:'idle'});
});
test('bounds retry loop and stops on terminal failure',async()=>{
 const drain=createQueueDrain({maxSteps:2,worker:{async runOnce(){return result('queued');}}});
 assert.equal((await drain.run(input)).retried,2);
 const failed=createQueueDrain({worker:{async runOnce(){return result('failed');}}});
 assert.equal((await failed.run(input)).reason,'failed');
});
test('rejects overlapping runs and honors stop before next claim',async()=>{
 let resolve;let calls=0;
 const drain=createQueueDrain({worker:{runOnce(){calls++;return new Promise(r=>{resolve=r;});}}});
 const pending=drain.run(input);
 await assert.rejects(drain.run(input),/unavailable/);
 drain.stop();resolve(result('succeeded'));
 assert.equal((await pending).reason,'stopped');assert.equal(calls,1);
 await assert.rejects(drain.run(input),/unavailable/);
});
test('fails closed on unexpected result or targeted workflow task',async()=>{
 const drain=createQueueDrain({worker:{async runOnce(){return {state:'succeeded',releaseApproved:true};}}});
 await assert.rejects(drain.run(input),/Unexpected/);
 await assert.rejects(drain.run({...input,expectedTaskId:'fixture'}),/Invalid/);
});
