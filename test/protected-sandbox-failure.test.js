'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../scripts/protected-sandbox/fixtureHarness'),'utf8');
const image='node@sha256:'+'a'.repeat(64);
function harness(outcome,followups=[]){
 const calls=[];const module={exports:{}};
 vm.runInNewContext(source,{module,require:name=>name==='node:child_process'?{spawnSync:(exe,args,options)=>{calls.push({exe,args,options});return calls.length===1?outcome:(followups[calls.length-2]??{status:0,stdout:'',stderr:''});}}:require(name)});
 return {api:module.exports,calls};
}
test('unknown, malformed and failed fixture outcomes deny acceptance and attempt scoped cleanup',()=>{
 for(const outcome of [{error:new Error('timeout')},{signal:'SIGKILL'},{status:1},{status:0,stdout:'fixture-ok\n',stderr:''},{status:0,stdout:'fixture-ok',stderr:'warning'}]){
  const {api,calls}=harness(outcome);
  assert.throws(()=>api.run(image),/outcome denied/);
  assert.equal(calls.length,3);
  const name=calls[0].args[calls[0].args.indexOf('--name')+1];
  assert.match(name,/^alphine-fixture-[a-f0-9-]{36}$/);
  assert.equal(calls[1].args.join(' '),'rm -f '+name);
  assert.equal(calls[1].options.timeout,5000);
 }
});
test('fixed success remains non-authorizing and non-attesting',()=>{
 const {api,calls}=harness({status:0,stdout:'fixture-ok',stderr:''});
 const result=api.run(image);
 assert.equal(result.fixturePassed,true);
 assert.equal(result.executionAuthorized,false);
 assert.equal(result.attestation,false);
 assert.equal(calls.length,2);
 assert.equal(calls[0].options.timeout,15000);
});
test('invalid image never invokes Docker',()=>{
 const {api,calls}=harness({});
 assert.throws(()=>api.run('node:latest'),/Pinned/);
 assert.equal(calls.length,0);
});

test('residual or unverifiable container denies success even after cleanup',()=>{
 const ok={status:0,stdout:'fixture-ok',stderr:''};
 for(const followups of [[{status:0,stdout:'residual',stderr:''},{status:0},{status:0,stdout:'',stderr:''}],[{status:1},{status:1},{status:1}]]){
 const {api,calls}=harness(ok,followups);assert.throws(()=>api.run(image),/outcome denied/);assert.equal(calls.length,4);
 }
});
