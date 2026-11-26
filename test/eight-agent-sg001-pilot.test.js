'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {evaluatePilotPreparation,describeCleanup}=require('../src/automation/engineeringTeam/restrictedPilotPreparation');
const now=Date.parse('2026-11-27T00:00:00Z');
function fixture(){
 const scope={project:'development-automation',repository:'alphineaiinc/aca-realtime-gateway-clean',task:'S3-01',role:'manager',branch:'automation/stage3-pilot',path:'src/automation/engineeringTeam/registry.js',sourceSha:'a'.repeat(40),artifactDigest:'b'.repeat(64),runId:'run1',purpose:'synthetic-read-only'};
 const binding=createHash('sha256').update(JSON.stringify(['sg001-pilot-preparation-v1',...Object.values(scope)])).digest('hex');
 const cleanup={binding,actor:'owner',resource:'test1',deadline:now+7200000,actions:['stop','revoke-test-access','remove-test-resource','verify-cleanup'],approved:true};
 return {scope,now,approval:{policySha:'3ff0230e8c4c5344a1bf7a38db2050e9cd7251a6',binding,start:now,end:now+3600000,revoked:false,stopped:false,authorized:true,cleanup},evidence:{binding,isolated:true,productionDenied:true,permissions:['synthetic-read-only'],provenanceVerified:true,cleanupEffective:true,cleanupObservable:true,cleanupPending:false,costKnown:true,additionalCostCents:0,allowanceVerified:true}};
}
test('consistent preparation never authorizes execution or release',()=>{const r=evaluatePilotPreparation(fixture());assert.equal(r.status,'preparation-consistent');assert.equal(r.executionAuthorized,false);assert.equal(r.releaseAuthorized,false);assert.equal(Object.isFrozen(r),true);});
const cases={
 'wrong project':x=>x.scope.project='aca',
 'wrong repository':x=>x.scope.repository='other/repo',
 'wrong task':x=>x.scope.task='P4-03',
 'wrong role':x=>x.scope.role='admin',
 'wrong branch':x=>x.scope.branch='main',
 'path traversal':x=>x.scope.path='src/automation/engineeringTeam/../index.js',
 'changed artifact':x=>x.scope.artifactDigest='c'.repeat(64),
 'changed source':x=>x.scope.sourceSha='c'.repeat(40),
 'changed run':x=>x.scope.runId='run2',
 'write purpose':x=>x.scope.purpose='write',
 'wrong policy':x=>x.approval.policySha='c'.repeat(40),
 'missing approval':x=>x.approval.authorized=false,
 'revoked':x=>x.approval.revoked=true,
 'stopped':x=>x.approval.stopped=true,
 'expired':x=>x.now=x.approval.end,
 'premature':x=>x.now=x.approval.start-1,
 'overlong':x=>x.approval.end++,
 'outside policy':x=>x.approval.end=Date.parse('2026-12-27'),
 'production reachable':x=>x.evidence.productionDenied=false,
 'no isolation':x=>x.evidence.isolated=false,
 'extra permission':x=>x.evidence.permissions.push('write'),
 'unknown provenance':x=>x.evidence.provenanceVerified=false,
 'unknown cost':x=>x.evidence.costKnown=false,
 'positive cost':x=>x.evidence.additionalCostCents=1,
 'unknown allowance':x=>x.evidence.allowanceVerified=false,
 'cleanup pending':x=>x.evidence.cleanupPending=true,
 'cleanup unavailable':x=>x.evidence.cleanupEffective=false,
 'cleanup unobservable':x=>x.evidence.cleanupObservable=false,
 'cleanup unapproved':x=>x.approval.cleanup.approved=false,
 'cleanup extra authority':x=>x.approval.cleanup.actions.push('restart'),
 'cleanup wrong binding':x=>x.approval.cleanup.binding='c'.repeat(64),
 'trusted verdict injection':x=>x.evidence.releaseAuthorized=true
};
for(const [name,mutate] of Object.entries(cases))test('deny '+name,()=>{const x=fixture();mutate(x);const r=evaluatePilotPreparation(x);assert.equal(r.status,'denied');assert.equal(r.executionAuthorized,false);assert.equal(r.releaseAuthorized,false);});
test('missing input fails closed',()=>assert.equal(evaluatePilotPreparation().status,'denied'));
test('cleanup obligation survives run expiry but never authorizes side effects',()=>{const x=fixture(),plan=x.approval.cleanup;const input={binding:plan.binding,plan,now:x.approval.end,resource:plan.resource,actor:plan.actor};const r=describeCleanup(input);assert.equal(r.status,'cleanup-obligation');assert.equal(r.executionAuthorized,false);assert.equal(r.releaseAuthorized,false);assert.equal(describeCleanup({...input,now:plan.deadline}).status,'quarantine-escalate');assert.equal(describeCleanup({...input,resource:'other'}).status,'denied');assert.equal(describeCleanup({...input,actor:'other'}).status,'denied');});

test('canonical registry roles are accepted and old aliases denied',()=>{
 for(const role of Object.keys(require('../src/automation/engineeringTeam/registry').roles)){
 const x=fixture();x.scope.role=role;
 const binding=createHash('sha256').update(JSON.stringify(['sg001-pilot-preparation-v1',...Object.values(x.scope)])).digest('hex');
 x.approval.binding=binding;x.approval.cleanup.binding=binding;x.evidence.binding=binding;
 assert.equal(evaluatePilotPreparation(x).status,'preparation-consistent',role);
 }
 for(const role of ['architect','backend','frontend','qa','security']){
 const x=fixture();x.scope.role=role;
 const binding=createHash('sha256').update(JSON.stringify(['sg001-pilot-preparation-v1',...Object.values(x.scope)])).digest('hex');
 x.approval.binding=binding;x.approval.cleanup.binding=binding;x.evidence.binding=binding;
 assert.equal(evaluatePilotPreparation(x).status,'denied',role);
 }
});
