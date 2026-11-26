'use strict';
// SG-001: pure, disabled preparation policy. No provider, queue, signing,
// production verdict, resource creation or teardown side effect is exposed.
const {createHash}=require('node:crypto');
const PROJECT='development-automation', REPO='alphineaiinc/aca-realtime-gateway-clean';
const POLICY='3ff0230e8c4c5344a1bf7a38db2050e9cd7251a6';
const START=Date.parse('2026-11-26T03:50:20.318Z'), END=Date.parse('2026-12-26T03:50:20.318Z');
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const time=Number.isSafeInteger;
const tasks=new Set(['S3-01','S3-02','S3-03','S3-04','S3-05','S3-06','S3-07','S3-08']);
const roles=new Set(['manager','project-manager','architect','backend','frontend','qa','security','devops','orchestrator']);
const keys=(x,k)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===k.split(',').sort().join(',');
const deny=()=>Object.freeze({domain:'sg001-pilot-preparation-v1',status:'denied',executionAuthorized:false,releaseAuthorized:false});
function evaluatePilotPreparation({scope,approval,evidence,now}={}){
 try{
 if(!keys(scope,'project,repository,task,role,branch,path,sourceSha,artifactDigest,runId,purpose')||
 scope.project!==PROJECT||scope.repository!==REPO||!tasks.has(scope.task)||!roles.has(scope.role)||
 !/^automation\/stage3-[a-z0-9-]{1,80}$/.test(scope.branch)||typeof scope.branch!=='string'||
 typeof scope.path!=='string'||! /^(src\/automation\/engineeringTeam\/[A-Za-z0-9_-]+|test\/eight-agent-[A-Za-z0-9_-]+)\.js$/.test(scope.path)||
 !sha(scope.sourceSha)||!digest(scope.artifactDigest)||!id(scope.runId)||scope.purpose!=='synthetic-read-only')return deny();
 const binding=createHash('sha256').update(JSON.stringify(['sg001-pilot-preparation-v1',...['project','repository','task','role','branch','path','sourceSha','artifactDigest','runId','purpose'].map(k=>scope[k])])).digest('hex');
 if(!keys(approval,'policySha,binding,start,end,revoked,stopped,authorized,cleanup')||approval.policySha!==POLICY||approval.binding!==binding||
 approval.authorized!==true||approval.revoked!==false||approval.stopped!==false||!time(now)||!time(approval.start)||!time(approval.end)||
 approval.start<START||approval.end>END||approval.end<=approval.start||approval.end-approval.start>3600000||now<approval.start||now>=approval.end)return deny();
 const c=approval.cleanup;
 if(!keys(c,'binding,actor,resource,deadline,actions,approved')||c.binding!==binding||!id(c.actor)||!id(c.resource)||
 !time(c.deadline)||c.deadline<approval.end||c.deadline>approval.end+3600000||c.approved!==true||
 !Array.isArray(c.actions)||JSON.stringify(c.actions)!==JSON.stringify(['stop','revoke-test-access','remove-test-resource','verify-cleanup']))return deny();
 if(!keys(evidence,'binding,isolated,productionDenied,permissions,provenanceVerified,cleanupEffective,cleanupObservable,cleanupPending,costKnown,additionalCostCents,allowanceVerified')||
 evidence.binding!==binding||evidence.isolated!==true||evidence.productionDenied!==true||
 JSON.stringify(evidence.permissions)!=='["synthetic-read-only"]'||evidence.provenanceVerified!==true||
 evidence.cleanupEffective!==true||evidence.cleanupObservable!==true||evidence.cleanupPending!==false||
 evidence.costKnown!==true||evidence.additionalCostCents!==0||evidence.allowanceVerified!==true)return deny();
 return Object.freeze({domain:'sg001-pilot-preparation-v1',status:'preparation-consistent',binding,executionAuthorized:false,releaseAuthorized:false});
 }catch{return deny();}
}
// Only describes a preauthorized cleanup obligation, never executes it.
// Caller assertions are NOT authenticated authority or operational evidence.
function describeCleanup({binding,plan,now,resource,actor}={}){
 try{
 if(!digest(binding)||!keys(plan,'binding,actor,resource,deadline,actions,approved')||plan.binding!==binding||plan.approved!==true||
 !id(actor)||!id(resource)||actor!==plan.actor||resource!==plan.resource||!time(now)||!time(plan.deadline)||
 JSON.stringify(plan.actions)!=='["stop","revoke-test-access","remove-test-resource","verify-cleanup"]')return deny();
 return Object.freeze({domain:'sg001-pilot-preparation-v1',status:now>=plan.deadline?'quarantine-escalate':'cleanup-obligation',executionAuthorized:false,releaseAuthorized:false});
 }catch{return deny();}
}
module.exports={evaluatePilotPreparation,describeCleanup};
