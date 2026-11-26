'use strict';
const {createHash,createPublicKey,verify}=require('node:crypto');
const {createPilotPreparationRecorder}=require('./pilotPreparationRecorder');
const DOMAIN='sg001-pilot-evidence-v1';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const keys=(x,k)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===k.split(',').sort().join(',');
function createPilotEvidenceVerifier({publicKey,issuer,clock=Date.now,isRevoked}={}){
 const key=createPublicKey(publicKey);
 if(key.asymmetricKeyType!=='ed25519'||typeof issuer!=='string'||!issuer||typeof isRevoked!=='function')throw Error('Invalid pilot evidence verifier');
 return async function check(envelope,kind,binding){
 try{
 const r=JSON.parse(JSON.stringify(envelope?.record));
 const signature=envelope?.signature;
 if(!keys(r,'domain,issuer,kind,binding,issuedAt,expiresAt,body')||r.domain!==DOMAIN||r.issuer!==issuer||r.kind!==kind||!hex(binding)||r.binding!==binding||
 !Number.isSafeInteger(r.issuedAt)||!Number.isSafeInteger(r.expiresAt)||r.expiresAt<=r.issuedAt||r.expiresAt-r.issuedAt>300000||r.issuedAt>clock()||r.expiresAt<=clock()||
 typeof signature!=='string'||!/^[a-f0-9]{128}$/.test(signature))return null;
 const payload=JSON.stringify([DOMAIN,issuer,kind,binding,r.issuedAt,r.expiresAt,r.body]);
 if(!verify(null,Buffer.from(payload),key,Buffer.from(signature,'hex'))||await isRevoked(issuer)!==false||r.expiresAt<=clock())return null;
 return JSON.parse(payload)[6];
 }catch{return null;}
 };
}
// Pilot-only identity verification: no generic queue/approval credential accepted.
function createPilotOwnerVerifier({publicKey,issuer,audience,principals,isRevoked}={}){
 const {verify:verifyJwt}=require('jsonwebtoken');
 const key=createPublicKey(publicKey);
 if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048||typeof issuer!=='string'||!issuer||audience!=='sg001-pilot-preparation-v1'||typeof isRevoked!=='function'||!Array.isArray(principals)||principals.length!==1)throw Error('Invalid pilot identity configuration');
 const p=Object.freeze({...principals[0]});
 if(typeof p.id!=='string'||! /^[A-Za-z0-9_.-]{1,80}$/.test(p.id)||p.permission!=='owner.approval'||p.product!=='development-automation'||p.repository!=='alphineaiinc/aca-realtime-gateway-clean'||! /^[a-f0-9]{40}$/.test(p.sha)||p.role!==undefined)throw Error('Invalid pilot owner');
 return async(token,binding)=>{
  try{
   if(typeof token!=='string'||token.length>4096||!hex(binding))return null;
   const c=verifyJwt(token,key,{algorithms:['RS256'],issuer,audience,maxAge:'5m',clockTolerance:0});
   if(c.aud!==audience||c.sub!==p.id||c.permission!==p.permission||c.product!==p.product||c.repository!==p.repository||c.sha!==p.sha||c.role!==undefined||c.purpose!=='sg001-pilot-preparation'||c.projectBoundaryDigest!==binding||!Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||c.exp<=c.iat||c.exp-c.iat>300||c.iat>Math.floor(Date.now()/1000)||typeof c.jti!=='string'||! /^[A-Za-z0-9_.-]{1,100}$/.test(c.jti))return null;
   if(await isRevoked({id:p.id,jti:c.jti})!==false||c.exp<=Math.floor(Date.now()/1000))return null;
   return Object.freeze({id:p.id,permission:p.permission,product:p.product,repository:p.repository,sha:p.sha,binding});
  }catch{return null;}
 };
}
// Composition only; no signing keys, provider clients, or runtime registration.
// Caller cannot supply evidence or identity claims directly.
function createVerifiedPilotRecorder({store,authenticate,verifyEvidence,loadEvidence,clock=Date.now}={}){
 if(typeof authenticate!=='function'||typeof verifyEvidence!=='function'||typeof loadEvidence!=='function')throw Error('Trusted adapters required');
 return createPilotPreparationRecorder({store,clock,
 authenticateOwner:async(credential,binding)=>{
 const actor=await authenticate(credential,binding);
 return actor?.permission==='owner.approval'&&actor.binding===binding?actor:null;
 },
 readEvidence:async(tx,scope)=>{
 const binding=hash([DOMAIN,'scope',scope.project,scope.repository,scope.task,scope.role,scope.branch,scope.path,scope.sourceSha,scope.artifactDigest,scope.runId,scope.purpose]);
 const envelope=await loadEvidence(tx,scope.runId);
 return await verifyEvidence(envelope,'preparation',binding);
 }});
}
// No runtime registration. Separate pinned verifier configuration per evidence role.
function createDisabledPilotComposition({pool,identity,preparationEvidence,stopEvidence,teardownEvidence,clock=Date.now}={}){
 const {createPilotPostgresStore}=require('./pilotPostgresStore');
 const {createPilotStopRecorder}=require('./pilotStopRecorder');
 const {createPilotTeardownRecorder}=require('./pilotTeardownRecorder');
 const configs=[preparationEvidence,stopEvidence,teardownEvidence];
 const pins=configs.map(c=>createPublicKey(c.publicKey).export({type:'spki',format:'der'}).toString('hex'));
 if(new Set(pins).size!==3||new Set(configs.map(c=>c.issuer)).size!==3)throw Error('Distinct evidence authorities required');
 const [prep,stop,cleanup]=configs.map(c=>createPilotEvidenceVerifier({...c,clock}));
 const recorder=createVerifiedPilotRecorder({store:createPilotPostgresStore({pool}),authenticate:createPilotOwnerVerifier(identity),verifyEvidence:prep,loadEvidence:tx=>tx.readEvidence(),clock});
 return Object.freeze({record:recorder.record,stop:createPilotStopRecorder({pool,verifyEvidence:stop,clock}).record,recordCleanup:createPilotTeardownRecorder({pool,verifyEvidence:cleanup,clock}).record,executionAllowed:()=>false});
}
module.exports={createPilotEvidenceVerifier,createVerifiedPilotRecorder,createDisabledPilotComposition,createPilotOwnerVerifier};
