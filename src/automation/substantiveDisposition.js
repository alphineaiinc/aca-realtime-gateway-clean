"use strict";
// Offline draft only. Never grants signing or execution authority.
const {createPublicKey,KeyObject,verify}=require("node:crypto");
const hex=(v,n)=>typeof v==="string"&&v.length===n&&/^[a-f0-9]+$/.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const fields=["repositoryId","prNumber","issueNumber","headSha","reviewerId","challenge","evidenceSha256","status","findings","issuedAt","expiresAt"];
function validateDisposition({envelope,publicKey,expected,now=Math.floor(Date.now()/1000)}={}){
 try{
 const r=envelope.record;
 if(!r||Object.keys(r).sort().join(",")!==fields.slice().sort().join(",")||!hex(envelope.signature,128))return null;
 for(const k of fields.slice(0,7))if(r[k]!==expected[k])return null;
 if(!["repositoryId","prNumber","issueNumber","reviewerId"].every(k=>positive(r[k]))||!hex(r.headSha,40)||!hex(r.challenge,64)||!hex(r.evidenceSha256,64))return null;
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(r.issuedAt)||!Number.isSafeInteger(r.expiresAt)||r.issuedAt>now||r.expiresAt<=now||r.expiresAt-r.issuedAt>120)return null;
 if(!["passed","findings","blocked"].includes(r.status)||!Number.isSafeInteger(r.findings)||r.findings<0||(r.status==="passed"&&r.findings!==0)||(r.status==="findings"&&r.findings===0))return null;
 const key=publicKey instanceof KeyObject&&publicKey.type==="public"?publicKey:createPublicKey(publicKey);
 if(key.asymmetricKeyType!=="ed25519"||!verify(null,Buffer.from(JSON.stringify(["aca-substantive-disposition-v1",...fields.map(k=>r[k])])),key,Buffer.from(envelope.signature,"hex")))return null;
 return Object.freeze({status:r.status,findings:r.findings,evidenceSha256:r.evidenceSha256,signingAuthorized:false,executionAuthorized:false});
 }catch{return null;}
}
module.exports={validateDisposition};
