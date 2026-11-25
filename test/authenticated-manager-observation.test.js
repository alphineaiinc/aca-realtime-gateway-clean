'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
const {createAuthenticatedObservation}=require('../src/automation/engineeringTeam/authenticatedObservation');
test('signed workflow completion binds scope and stable replay identity',async()=>{
 const secret=Buffer.alloc(32,7),scope={repository:'owner/repo',sha:'a'.repeat(40)},keys=[];
 const deliver=createAuthenticatedObservation({secret,scope,observeEvent:async k=>keys.push(k)});
 const body={repository:{full_name:scope.repository},action:'completed',workflow_run:{head_sha:scope.sha,event:'push',status:'completed',id:42,run_attempt:1}};
 const sign=b=>'sha256='+createHmac('sha256',secret).update(b).digest('hex');
 const raw=Buffer.from(JSON.stringify(body));
 await deliver(raw,sign(raw));await deliver(raw,sign(raw));
 await assert.rejects(deliver(raw,'sha256='+'0'.repeat(64)));
 const wrong=Buffer.from(JSON.stringify({...body,repository:{full_name:'other/repo'}}));
 await assert.rejects(deliver(wrong,sign(wrong)));
 assert.deepEqual(keys,['run:42:1','run:42:1']);
});
