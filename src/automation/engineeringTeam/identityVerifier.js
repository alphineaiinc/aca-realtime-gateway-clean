'use strict';
const {verify}=require('jsonwebtoken');
const {createPublicKey}=require('node:crypto');
const {getRole}=require('./registry');
// Verification only. No signing key, issuance endpoint, or default credentials.
function createIdentityVerifier({publicKey,issuer,audience,principals,isRevoked}={}){
 if(typeof issuer!=='string'||!issuer||typeof audience!=='string'||!audience||!Array.isArray(principals)||!principals.length||principals.length>64||typeof isRevoked!=='function')throw Error('Invalid identity configuration');
 const key=createPublicKey(publicKey);
 if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)throw Error('Invalid verification key');
 const registry=new Map();
 for(const p of principals){
  if(!p||typeof p.id!=='string'||! /^[A-Za-z0-9_.-]{1,80}$/.test(p.id)||registry.has(p.id)||!['queue.manage','queue.work','owner.approval'].includes(p.permission)||typeof p.product!=='string'||typeof p.repository!=='string'||! /^[a-f0-9]{40}$/.test(p.sha))throw Error('Invalid principal');
  if(p.permission==='queue.work')getRole(p.role);else if(p.role!==undefined)throw Error('Invalid privileged principal');
  registry.set(p.id,Object.freeze({id:p.id,product:p.product,repository:p.repository,sha:p.sha,permission:p.permission,...(p.role===undefined?{}:{role:p.role})}));
 }
 return async function authenticate(token,projectBinding){
  try{
   if(typeof token!=='string'||token.length>4096)return null;
   const claims=verify(token,key,{algorithms:['RS256'],issuer,audience,maxAge:'5m',clockTolerance:0});
   const p=registry.get(claims.sub);
   if(!p||!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||claims.exp<=claims.iat||claims.exp-claims.iat>300||claims.iat>Math.floor(Date.now()/1000)||typeof claims.jti!=='string'||! /^[A-Za-z0-9_.-]{1,100}$/.test(claims.jti)||claims.product!==p.product||claims.repository!==p.repository||claims.sha!==p.sha||claims.permission!==p.permission||claims.role!==p.role)return null;
   if(projectBinding!==undefined&&(p.permission!=='owner.approval'||typeof projectBinding!=='string'||! /^[a-f0-9]{64}$/.test(projectBinding)||claims.projectBoundaryDigest!==projectBinding||claims.purpose!=='automation-preparation'))return null;
   if(await isRevoked({id:p.id,jti:claims.jti})!==false||claims.exp<=Math.floor(Date.now()/1000))return null;
   return p;
  }catch{return null;}
 };
}
module.exports={createIdentityVerifier};
