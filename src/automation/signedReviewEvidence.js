"use strict";
const {verify,createPublicKey}=require("node:crypto");
const SHA=/^[a-f0-9]{40}$/;
const positive=n=>Number.isSafeInteger(n)&&n>0;
/**
 * Offline Ed25519 verification of a reviewer service's signed verdict.
 * Public key must be pinned by the trusted caller (never PR content).
 * The authenticated service must enforce reviewer independence and key custody.
 */
function verifySignedReview({envelope,publicKey,repositoryId,prNumber,headSha,reviewerId}={}){
 if(!positive(repositoryId)||!positive(prNumber)||!positive(reviewerId)||
    !SHA.test(headSha||"")||!envelope||typeof envelope!=="object"||
    typeof envelope.signature!=="string"||!(/^[a-fA-F0-9]{128}$/).test(envelope.signature))
   return null;
 const record=envelope.record;
 if(!record||Object.keys(record).sort().join(",")!==
    ["findings","headSha","prNumber","repositoryId","reviewerId","status"].sort().join(",")||
    record.repositoryId!==repositoryId||record.prNumber!==prNumber||
    record.headSha!==headSha||record.reviewerId!==reviewerId||
    !["passed","findings","blocked","pending"].includes(record.status)||
    !Number.isSafeInteger(record.findings)||record.findings<0||
    (record.status==="passed"&&record.findings!==0)||
    (record.status==="findings"&&record.findings===0))return null;
 try{
   const key=createPublicKey(publicKey);
   if(key.asymmetricKeyType!=="ed25519")return null;
   const payload=Buffer.from(JSON.stringify([
     "aca-review-v1",record.repositoryId,record.prNumber,record.headSha,
     record.reviewerId,record.status,record.findings
   ]),"utf8");
   if(!verify(null,payload,key,Buffer.from(envelope.signature,"hex")))return null;
   return Object.freeze({headSha,status:record.status,findings:record.findings,
     independent:true,source:"trusted_review"});
 }catch{return null;}
}
module.exports={verifySignedReview};
