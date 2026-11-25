"use strict";
const {verify,createPublicKey,KeyObject}=require("node:crypto");
const SHA=/^[a-f0-9]{40}$/;
const positive=n=>Number.isSafeInteger(n)&&n>0;
/**
 * Offline Ed25519 verification of a reviewer service's signed verdict.
 * Public key must be pinned by the trusted caller (never PR content).
 * The authenticated service must enforce reviewer independence and key custody.
 */
function verifySignedReview({envelope,publicKey,repositoryId,prNumber,issueNumber,headSha,reviewerId,challenge}={}){
 if(!positive(repositoryId)||!positive(prNumber)||!positive(issueNumber)||!positive(reviewerId)||typeof challenge!=='string'||!/^[a-f0-9]{64}$/.test(challenge)||
    (typeof headSha!=="string"||!SHA.test(headSha))||!envelope||typeof envelope!=="object"||
    typeof envelope.signature!=="string"||!(/^[a-fA-F0-9]{128}$/).test(envelope.signature))
   return null;
 const record=envelope.record;
 if(!record||Object.keys(record).sort().join(",")!==
    ["findings","headSha","prNumber","repositoryId","reviewerId","status","issueNumber","challenge","issuedAt","expiresAt"].sort().join(",")||
    record.repositoryId!==repositoryId||record.prNumber!==prNumber||record.issueNumber!==issueNumber||record.challenge!==challenge||
    !Number.isSafeInteger(record.issuedAt)||!Number.isSafeInteger(record.expiresAt)||record.issuedAt>Math.floor(Date.now()/1000)||record.expiresAt<=Math.floor(Date.now()/1000)||record.expiresAt<=record.issuedAt||record.expiresAt-record.issuedAt>120||
    record.headSha!==headSha||record.reviewerId!==reviewerId||
    !["passed","findings","blocked","pending"].includes(record.status)||
    !Number.isSafeInteger(record.findings)||record.findings<0||
    (record.status==="passed"&&record.findings!==0)||
    (record.status==="findings"&&record.findings===0))return null;
 try{
   if(publicKey instanceof KeyObject&&publicKey.type!=="public")return null;
   if(typeof publicKey==="string"&&!/^-----BEGIN PUBLIC KEY-----\r?\n/.test(publicKey))return null;
   if(!(publicKey instanceof KeyObject)&&typeof publicKey!=="string")return null;
   const key=publicKey instanceof KeyObject ? publicKey : createPublicKey(publicKey);
   if(key.asymmetricKeyType!=="ed25519")return null;
   const payload=Buffer.from(JSON.stringify([
     "aca-review-v2",record.repositoryId,record.prNumber,record.headSha,
     record.reviewerId,record.status,record.findings,record.issueNumber,record.challenge,record.issuedAt,record.expiresAt
   ]),"utf8");
   if(!verify(null,payload,key,Buffer.from(envelope.signature,"hex")))return null;
   return Object.freeze({headSha,status:record.status,findings:record.findings,
     independent:true,source:"trusted_review"});
 }catch{return null;}
}
module.exports={verifySignedReview};
