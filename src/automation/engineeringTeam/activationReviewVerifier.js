'use strict';
const {verify,createPublicKey,KeyObject}=require('node:crypto');
const {createActivationManifest}=require('./activationManifest');
const {digest}=require('./patchPlanner');
// Separate domain from PR #21 aca-review-v1. A code review cannot be reused
// as configuration acceptance. No private key, signing or live admission.
function createActivationReviewVerifier({manifest,publicKey,reviewerId,authorIds,isRevoked}={}){
 const pinned=createActivationManifest(manifest);
 if(manifest.executionAuthorized!==false||pinned.evidenceSha256!==manifest.evidenceSha256||typeof reviewerId!=='string'||! /^[A-Za-z0-9_.-]{1,80}$/.test(reviewerId)||!Array.isArray(authorIds)||!authorIds.length||authorIds.some(x=>typeof x!=='string'||!x)||authorIds.includes(reviewerId)||typeof isRevoked!=='function')throw Error('Invalid independent review configuration');
 const key=publicKey instanceof KeyObject&&publicKey.type==='public'?publicKey:createPublicKey(publicKey);
 if(key.type!=='public'||key.asymmetricKeyType!=='ed25519')throw Error('Invalid reviewer key');
 return Object.freeze({async verify(envelope){
  try{
   const r=envelope?.record;
   if(!r||Object.keys(r).sort().join(',')!==['manifestDigest','reviewerId','status','findings','issuedAt','expiresAt'].sort().join(',')||r.manifestDigest!==pinned.evidenceSha256||r.reviewerId!==reviewerId||r.status!=='passed'||r.findings!==0||!Number.isSafeInteger(r.issuedAt)||!Number.isSafeInteger(r.expiresAt)||r.expiresAt-r.issuedAt>900||r.expiresAt<=r.issuedAt||typeof envelope.signature!=='string'||! /^[a-f0-9]{128}$/.test(envelope.signature))return null;
   const now=Math.floor(Date.now()/1000);
   if(r.issuedAt>now||r.expiresAt<=now)return null;
   const payload=JSON.stringify(['aca-engineering-activation-review-v1',r.manifestDigest,r.reviewerId,r.status,r.findings,r.issuedAt,r.expiresAt]);
   if(!verify(null,Buffer.from(payload),key,Buffer.from(envelope.signature,'hex'))||await isRevoked(reviewerId)!==false||r.expiresAt<=Math.floor(Date.now()/1000))return null;
   return Object.freeze({manifestDigest:pinned.evidenceSha256,reviewerId,evidenceSha256:digest(payload),expiresAt:r.expiresAt,executionAuthorized:false});
  }catch{return null;}
 }});
}
module.exports={createActivationReviewVerifier};
