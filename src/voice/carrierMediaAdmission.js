"use strict";
const {randomBytes,createHash}=require("node:crypto");
const {carrierCallIdentity}=require("./carrierCallIdentity");
const digest=t=>createHash("sha256").update(t).digest("hex");
// Internal only: authenticate must be a trusted adapter verifier, never request supplied.
// Store must atomically reserve once per call and consume once with expiry and binding.
function createCarrierMediaAdmission({authenticate,lookupBinding,store}){
 if(typeof authenticate!=="function"||typeof lookupBinding!=="function"||
 typeof store?.reserve!=="function"||typeof store?.consume!=="function")throw Error("INVALID_ADMISSION_DEPENDENCIES");
 async function verified(input){
  const identity=await authenticate(input);
  if(!identity)return null;
  const key=carrierCallIdentity(identity);
  const binding=await lookupBinding({carrier:identity.carrier,accountId:identity.accountId,calledNumber:identity.calledNumber});
  if(binding?.active!==true||!Number.isSafeInteger(binding.tenantId)||binding.tenantId<=0)return null;
  return {key,tenantId:binding.tenantId,carrier:identity.carrier,accountId:identity.accountId,calledNumber:identity.calledNumber};
 }
 return Object.freeze({
 async issue(input){
  const v=await verified(input);if(!v)return null;
  const token=randomBytes(32).toString("base64url");
  return await store.reserve({...v,tokenHash:digest(token),ttlSeconds:60})===true?token:null;
 },
 async consume(input,token){
  if(typeof token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const v=await verified(input);if(!v)return null;
  return await store.consume({...v,tokenHash:digest(token)})===true?Object.freeze({key:v.key,tenantId:v.tenantId}):null;
 }
 });
}
module.exports={createCarrierMediaAdmission};
