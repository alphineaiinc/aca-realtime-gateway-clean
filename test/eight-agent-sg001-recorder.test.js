'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createPilotPreparationRecorder}=require('../src/automation/engineeringTeam/pilotPreparationRecorder');
const now=Date.parse('2026-11-27T00:00:00Z');
function setup(){
 const scope={project:'development-automation',repository:'alphineaiinc/aca-realtime-gateway-clean',task:'S3-01',role:'manager',branch:'automation/stage3-pilot',path:'src/automation/engineeringTeam/registry.js',sourceSha:'a'.repeat(40),artifactDigest:'b'.repeat(64),runId:'run1',purpose:'synthetic-read-only'};
 const binding=createHash('sha256').update(JSON.stringify(['sg001-pilot-preparation-v1',...Object.values(scope)])).digest('hex');
 const approval={policySha:'3ff0230e8c4c5344a1bf7a38db2051a6',binding,start:now,end:now+3600000,revoked:false,stopped:false,authorized:true,cleanup:{binding,actor:'owner',resource:'test1',deadline:now+7200000,actions:['stop','revoke-test-access','remove-test-resource','verify-cleanup'],approved:true}};
 approval.policySha='3ff0230e8c4c5344a1bf7a38db2050e9cd7251a6';
 const evidence={binding,isolated:true,productionDenied:true,permissions:['synthetic-read-only'],provenanceVerified:true,cleanupEffective:true,cleanupObservable:true,cleanupPending:false,costKnown:true,additionalCostCents:0,allowanceVerified:true};
 let saved=null,queue=Promise.resolve(),reads=0,auths=0;
 const config={clock:()=>now,store:{transact:(_id,fn)=>{const pending=queue.then(()=>fn({read:async()=>saved,insert:async r=>{saved=r;return true;}}));queue=pending.catch(()=>{});return pending;}},readEvidence:async()=>{reads++;return {approval,evidence,expiresAt:now+1000};},authenticateOwner:async(c,b)=>{auths++;return c==='owner'?{id:'owner',permission:'owner.approval',product:scope.project,repository:scope.repository,sha:scope.sourceSha,binding:b}:null;}};
 return {scope,approval,evidence,config,counts:()=>({reads,auths}),saved:()=>saved};
}
test('record only, replay and concurrency denied',async()=>{const x=setup(),r=createPilotPreparationRecorder(x.config);const results=await Promise.all([r.record({scope:x.scope,credential:'owner'}),r.record({scope:x.scope,credential:'owner'})]);assert.deepEqual(results.map(v=>v.status).sort(),['denied','recorded-preparation']);assert.equal(x.saved().releaseAuthorized,false);assert.equal(r.executionAllowed(),false);assert.deepEqual(x.counts(),{reads:2,auths:2});});
test('wrong owner denied',async()=>{const x=setup();assert.equal((await createPilotPreparationRecorder(x.config).record({scope:x.scope,credential:'bad'})).status,'denied');assert.equal(x.saved(),null);});
test('evidence changes during transaction deny',async()=>{const x=setup();let n=0;const read=x.config.readEvidence;x.config.readEvidence=async(...args)=>{if(++n===2)x.approval.revoked=true;return read(...args);};assert.equal((await createPilotPreparationRecorder(x.config).record({scope:x.scope,credential:'owner'})).status,'denied');assert.equal(x.saved(),null);});
test('owner revocation during revalidation denies',async()=>{const x=setup();let n=0;const auth=x.config.authenticateOwner;x.config.authenticateOwner=async(...args)=>++n===2?null:auth(...args);assert.equal((await createPilotPreparationRecorder(x.config).record({scope:x.scope,credential:'owner'})).status,'denied');});
test('transaction failure returns no authorization',async()=>{const x=setup();x.config.store.transact=async()=>{throw Error('offline');};const r=await createPilotPreparationRecorder(x.config).record({scope:x.scope,credential:'owner'});assert.equal(r.status,'denied');assert.equal(r.executionAuthorized,false);});
test('missing trusted adapters fail closed',()=>assert.throws(()=>createPilotPreparationRecorder({})));

test('verified evidence expiring during final owner authentication denies insertion',async()=>{const x=setup();let t=now,n=0; x.config.clock=()=>t;const auth=x.config.authenticateOwner;x.config.authenticateOwner=async(...args)=>{const actor=await auth(...args);if(++n===2)t=now+1000;return actor;};assert.equal((await createPilotPreparationRecorder(x.config).record({scope:x.scope,credential:'owner'})).status,'denied');assert.equal(x.saved(),null);});
