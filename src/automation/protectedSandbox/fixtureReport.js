'use strict';
const {createHash}=require('node:crypto');
const fields=['harnessSha','image','fixtureSha256','attemptId','status','cleanupConfirmed','requiresReconciliation','provenance','executionAuthorized'];
const digest=value=>createHash('sha256').update(value).digest('hex');
// Integrity screening only: no signature, independent identity or execution grant.
function inspectFixedFixtureReport(report,expected){
 const denied=()=>Object.freeze({status:'denied',executionAuthorized:false});
 try{
  if(!report||!expected||Object.getPrototypeOf(report)!==Object.prototype||Object.keys(report).length!==fields.length+1||!fields.every(k=>Object.hasOwn(report,k))||!Object.hasOwn(report,'reportSha256'))return denied();
  const payload=Object.fromEntries(fields.map(k=>[k,report[k]]));
  if(typeof expected.harnessSha!=='string'||!/^[a-f0-9]{40}$/.test(expected.harnessSha)||typeof expected.image!=='string'||!/^node@sha256:[a-f0-9]{64}$/.test(expected.image)||typeof expected.fixtureSha256!=='string'||!/^[a-f0-9]{64}$/.test(expected.fixtureSha256)||typeof expected.attemptId!=='string'||!/^aca-fixture-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(expected.attemptId))return denied();
  if(['harnessSha','image','fixtureSha256','attemptId'].some(k=>payload[k]!==expected[k])||payload.status!=='passed'||payload.cleanupConfirmed!==true||payload.requiresReconciliation!==false||payload.provenance!=='unreviewed-fixed-fixture-harness'||payload.executionAuthorized!==false||report.reportSha256!==digest(JSON.stringify(payload)))return denied();
  return Object.freeze({status:'integrity-checked',reportSha256:report.reportSha256,provenance:'unauthenticated-fixture-report',executionAuthorized:false});
 }catch{return denied();}
}
module.exports={inspectFixedFixtureReport};
