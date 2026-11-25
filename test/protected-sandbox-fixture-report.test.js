'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createFixedSandboxHarness}=require('../src/automation/protectedSandbox/fixedHarness');
const {inspectFixedFixtureReport}=require('../src/automation/protectedSandbox/fixtureReport');
const image='node@sha256:'+'a'.repeat(64),harnessSha='b'.repeat(40);
const hash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
async function fixture(){
 let attemptId,fixtureSha256;
 const report=await createFixedSandboxHarness({image,harnessSha,execute:(_file,args)=>{
  if(args.includes('run')){
   attemptId=args[args.indexOf('--name')+1];
   fixtureSha256=createHash('sha256').update(args.at(-1)).digest('hex');
   return {status:0,stdout:'fixed-fixture-passed'};
  }
  return {status:0};
 }}).run();
 return {report,expected:{image,harnessSha,attemptId,fixtureSha256}};
}
test('fixed report screens exact harness output without granting authority',async()=>{
 const {report,expected}=await fixture();
 const result=inspectFixedFixtureReport(report,expected);
 assert.deepEqual(result,{status:'integrity-checked',reportSha256:report.reportSha256,provenance:'unauthenticated-fixture-report',executionAuthorized:false});
});
test('fixed report denies substituted provenance even with recomputed digest',async()=>{
 const {report,expected}=await fixture();
 for(const changes of [{image:'node@sha256:'+'c'.repeat(64)},{harnessSha:'c'.repeat(40)},{fixtureSha256:'c'.repeat(64)},{attemptId:'aca-fixture-12345678-1234-4234-8234-123456789abc'},{status:'denied'},{cleanupConfirmed:false},{requiresReconciliation:true},{executionAuthorized:true},{provenance:'trusted'}]){
  const {reportSha256,...payload}={...report,...changes};
  const result=inspectFixedFixtureReport({...payload,reportSha256:hash(payload)},expected);
  assert.deepEqual(result,{status:'denied',executionAuthorized:false});
 }
});
test('fixed report rejects malformed fields, tampering and missing independent expectations',async()=>{
 const {report,expected}=await fixture();
 for(const bad of [null,[],{...report,extra:'unexpected'},{...report,reportSha256:'0'.repeat(64)},{...report,cleanupConfirmed:'true'},Object.fromEntries(Object.entries(report).filter(([k])=>k!=='status'))]){
  assert.equal(inspectFixedFixtureReport(bad,expected).status,'denied');
 }
 for(const bad of [undefined,{}, {...expected,attemptId:'unknown'}, {...expected,image:'node:22'}]){
  assert.equal(inspectFixedFixtureReport(report,bad).status,'denied');
 }
});
test('integrity-only reports are explicitly replayable and unauthenticated',async()=>{
 const {report,expected}=await fixture();
 // Neither a digest nor this stateless checker supplies trusted origin or durable replay protection.
 for(let i=0;i<2;i++)assert.deepEqual(inspectFixedFixtureReport(report,expected),{status:'integrity-checked',reportSha256:report.reportSha256,provenance:'unauthenticated-fixture-report',executionAuthorized:false});
});
