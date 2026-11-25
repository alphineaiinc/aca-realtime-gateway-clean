'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFixedSandboxHarness}=require('../src/automation/protectedSandbox/fixedHarness');
const image='node@sha256:'+'a'.repeat(64),harnessSha='b'.repeat(40);
test('fixed harness rejects floating tags and invalid provenance',()=>{
 for(const invalid of ['node:22','other@sha256:'+'a'.repeat(64),'node@sha256:bad'])assert.throws(()=>createFixedSandboxHarness({image:invalid,harnessSha}),/Invalid harness/);
 assert.throws(()=>createFixedSandboxHarness({image,harnessSha:'main'}),/Invalid harness/);
});
test('fixed harness enforces isolation, bounded execution, cleanup and no authority',async()=>{
 const calls=[];
 const h=createFixedSandboxHarness({image,harnessSha,execute:(file,args,opts)=>{
  calls.push({file,args,opts});return {status:0,stdout:args.includes('run')?'fixed-fixture-passed':''};
 }});
 const report=await h.run();
 assert.equal(report.status,'passed');assert.equal(report.executionAuthorized,false);
 assert.equal(report.provenance,'unreviewed-fixed-fixture-harness');
 assert.match(report.fixtureSha256,/^[a-f0-9]{64}$/);
 assert.equal(report.cleanupConfirmed,true);assert.equal(report.requiresReconciliation,false);
 const {reportSha256,...payload}=report;
 assert.equal(reportSha256,require('node:crypto').createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
 assert.equal(report.image,image);assert.equal(report.harnessSha,harnessSha);
 assert.equal(calls.length,2);
 const [run,cleanup]=calls;
 for(const flag of ['--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--memory=128m','--memory-swap=128m','--cpus=0.5','--pids-limit=32'])assert.ok(run.args.includes(flag));
 assert.ok(run.args.includes('65534:65534'));assert.ok(run.args.includes(image));
 assert.ok(!run.args.includes('-v')&&!run.args.includes('--privileged'));
 assert.equal(run.file,'/usr/bin/docker');assert.equal(run.opts.shell,false);
 assert.equal(run.opts.timeout,30000);assert.equal(run.opts.killSignal,'SIGKILL');assert.equal(run.opts.maxBuffer,65536);
 assert.deepEqual(Object.keys(run.opts.env).sort(),['HOME','PATH']);
 assert.deepEqual(cleanup.args.slice(2),['rm','-f',run.args[run.args.indexOf('--name')+1]]);
 await assert.rejects(h.run(),/consumed/);
});
test('failure, timeout, fake output and cleanup failure never pass',async()=>{
 for(const runResult of [{status:1},{status:0,stdout:'fake'},{status:null,error:Error('timeout')},{status:0,stdout:'fixed-fixture-passed',signal:'SIGTERM'}]){
  let calls=0;
  const h=createFixedSandboxHarness({image,harnessSha,execute:()=>++calls===1?runResult:{status:0}});
  const r=await h.run();assert.equal(r.status,'denied');assert.equal(r.executionAuthorized,false);assert.equal(calls,2);
 }
 const h=createFixedSandboxHarness({image,harnessSha,execute:(_file,args)=>args.includes('run')?{status:0,stdout:'fixed-fixture-passed'}:{status:1}});
 const report=await h.run();assert.equal(report.status,'denied');assert.equal(report.cleanupConfirmed,false);assert.equal(report.requiresReconciliation,true);
 assert.match(report.attemptId,/^aca-fixture-[a-f0-9-]{36}$/);
});

test('thrown runner and cleanup errors remain denied and credential free',async()=>{
 const h=createFixedSandboxHarness({image,harnessSha,execute:()=>{throw Error('sensitive host diagnostic');}});
 const report=await h.run();
 assert.equal(report.status,'denied');assert.equal(report.requiresReconciliation,true);
 assert.equal(report.executionAuthorized,false);assert.ok(!JSON.stringify(report).includes('sensitive host diagnostic'));
});
