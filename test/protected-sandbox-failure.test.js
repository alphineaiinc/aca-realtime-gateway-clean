'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../scripts/protected-sandbox/fixtureHarness'),'utf8');
const id='a'.repeat(64);
const good=stdout=>({status:0,stdout,stderr:''});
const sequence=()=>[good(id+'\n'),good('true 134217728 134217728 500000000 32\n'),good('fixture-ok'),good('exited 0\n'),good(id+'\n'),good('')];
function harness(results){
 const calls=[],module={exports:{}};
 vm.runInNewContext(source,{module,require:n=>n==='node:child_process'?{spawnSync:(exe,args,options)=>{calls.push({exe,args,options});return results.shift();}}:n==='node:os'?{platform:()=> 'linux',arch:()=> 'x64'}:require(n)});
 return {api:module.exports,calls};
}
test('success uses ID-bound inspection, start and verified removal',()=>{
 const {api,calls}=harness(sequence());const result=api.run(api.imagePin);
 assert.equal(result.fixturePassed,true);assert.equal(result.executionAuthorized,false);assert.equal(result.attestation,false);
 assert.equal(calls.length,6);assert.equal(calls[2].args.join(' '),'start -a '+id);assert.equal(calls[4].args.join(' '),'rm -f '+id);
});
test('timeout, malformed output and stderr deny acceptance with cleanup',()=>{
 for(const outcome of [{error:new Error('timeout')},good('fixture-ok\n'),{status:0,stdout:'fixture-ok',stderr:'warning'}]){
  const {api,calls}=harness([sequence()[0],sequence()[1],outcome,good(id),good('')]);
  assert.throws(()=>api.run(api.imagePin),/outcome denied/);assert.equal(calls.length,5);
 }
});
test('failed state query or residual container denies acceptance',()=>{
 for(const outcome of [{status:1,stdout:'',stderr:''},good(id)]){
  const s=sequence();s[5]=outcome;const {api}=harness(s);assert.throws(()=>api.run(api.imagePin),/Cleanup unresolved/);
 }
});
test('unknown create never starts a container',()=>{
 const {api,calls}=harness([{error:new Error('timeout')}]);assert.throws(()=>api.run(api.imagePin),/Create unresolved/);assert.equal(calls.length,1);
});
test('unreviewed image rejected before Docker',()=>{
 const {api,calls}=harness([]);assert.throws(()=>api.run('node@sha256:'+id),/Reviewed pinned/);assert.equal(calls.length,0);
});
test('writable root configuration rejected and removed',()=>{
 const {api,calls}=harness([good(id),good('false 134217728 134217728 500000000 32'),good(id),good('')]);assert.throws(()=>api.run(api.imagePin),/Configuration denied/);assert.equal(calls.length,4);
});

test('fixed timeout fixture uses bounded start and denies acceptance',()=>{
 const {api,calls}=harness([sequence()[0],sequence()[1],{error:{code:'ETIMEDOUT'}},good('true 123\n'),good(id),good('')]);
 assert.throws(()=>api.runTimeoutFixture(),/Fixed timeout observed/);assert.equal(calls[2].options.timeout,2000);assert.equal(calls[4].args.join(' '),'rm -f '+id);
});
test('fixed failed query fixture denies acceptance after removal',()=>{
 const s=sequence();s[5]={status:125,stdout:'',stderr:'unknown flag'};
 s.push(good(''));const {api,calls}=harness(s);assert.throws(()=>api.runFailedQueryFixture(),/Fixed query failure reconciled/);assert.equal(calls[5].args.join(' '),'ps --invalid-fixed-fixture-option');
});

test('timeout without running process evidence is not accepted',()=>{
 const {api}=harness([sequence()[0],sequence()[1],{error:{code:'ETIMEDOUT'}},good('false 0'),good(id),good('')]);
 assert.throws(()=>api.runTimeoutFixture(),/Timeout start unverified/);
});
test('query fixture cannot mask removal failure or residual state',()=>{
 for(const removal of [false,true]){
 const s=sequence();if(removal)s[4]={status:1,stdout:'',stderr:'failed'};
 s[5]={status:125,stdout:'',stderr:'unknown flag'};s.push(good(id));
 const {api}=harness(s);assert.throws(()=>api.runFailedQueryFixture(),removal?/Removal unresolved/:/Cleanup unresolved/);
 }
});
