"use strict";
/**
 * Phase 2A owner-intent transport proof, development only.
 *
 * Ed25519 authenticates an exact owner, repository, request, decision and
 * audience for a <=60-second edge-to-private message. The edge MUST first
 * verify the real GitHub owner session + CSRF + current decision eligibility.
 * The private service MUST independently validate GitHub/CI/ledger evidence
 * after checking this proof and atomically consuming its nonce.
 *
 * NOT a Codex, signing, merge, deployment or production authorization.
 * No private keys or server operations on module import.
 */
const {randomBytes,sign,verify,createPrivateKey,createPublicKey}=require("node:crypto");
const ID=/^[a-f0-9]{64}$/;
const NONCE=/^[A-Za-z0-9_-]{43}$/;
const POS=n=>Number.isSafeInteger(n)&&n>0;
const NOW=n=>Number.isSafeInteger(n)&&n>=0;
const TTL=60000,VERSION="aca-owner-edge-proof-v1",ROTATED_VERSION="aca-owner-edge-proof-v2";
const KEY_ID=/^[a-z][a-z0-9-]{2,63}$/;
const flags=()=>({agentDispatchAuthorized:false,dispatched:false,mergeAuthorized:false,
 deployAuthorized:false,signingAuthorized:false,productionAuthorization:false});
const blocked=reason=>Object.freeze({verified:false,reason,...flags()});
function fields(x){return [
 x.version,x.issuer,x.audience,x.repositoryId,x.ownerId,x.requestId,
 x.decision,x.issuedAt,x.expiresAt,x.nonce,
 ...(x.version===ROTATED_VERSION?[x.keyId]:[])
];}
function valid(x){
 return (x?.version===VERSION||
  (x?.version===ROTATED_VERSION&&KEY_ID.test(x.keyId||"")))&&
 typeof x.issuer==="string"&&/^[a-z0-9][a-z0-9-]{2,62}$/.test(x.issuer)&&
 typeof x.audience==="string"&&/^[a-z0-9][a-z0-9-]{2,62}$/.test(x.audience)&&
 POS(x.repositoryId)&&POS(x.ownerId)&&ID.test(x.requestId||"")&&
 ["approve","reject"].includes(x.decision)&&NOW(x.issuedAt)&&
 NOW(x.expiresAt)&&x.expiresAt>x.issuedAt&&
 x.expiresAt-x.issuedAt<=TTL&&NONCE.test(x.nonce||"");
}
function payload(proof){return Buffer.from(JSON.stringify(fields(proof)));}
function issueOwnerEdgeProof({issuer,audience,repositoryId,ownerId,requestId,
 decision,privateKey,keyring,now=Date.now()}={}){
 const active=keyring?.signingKeyAt?.(now);
 if(keyring&&!active)return null;
 const proof={version:keyring?ROTATED_VERSION:VERSION,issuer,audience,
  repositoryId,ownerId,requestId,decision,issuedAt:now,
  expiresAt:now+TTL,nonce:randomBytes(32).toString("base64url"),
  ...(keyring?{keyId:active.id}:{})};
 if(!valid(proof)||!(active?.key||privateKey))return null;
 try{
  const chosen=active?.key||privateKey;
  const key=chosen?.type==="private"?chosen:createPrivateKey(chosen);
  if(key.asymmetricKeyType!=="ed25519")return null;
  const signature=sign(null,payload(proof),key).toString("base64url");
  return Object.freeze({...proof,signature});
 }catch{return null;}
}
async function verifyOwnerEdgeProof({proof,publicKey,keyring,expectedIssuer,
 expectedAudience,expectedRepositoryId,expectedOwnerId,expectedRequestId,
 expectedDecision,nonceStore,now=Date.now()}={}){
 if(!proof||Object.keys(proof).sort().join(",")!==
  (keyring?"audience,decision,expiresAt,issuedAt,issuer,keyId,nonce,ownerId,repositoryId,requestId,signature,version":
  "audience,decision,expiresAt,issuedAt,issuer,nonce,ownerId,repositoryId,requestId,signature,version")||
  (keyring&&proof.version!==ROTATED_VERSION)||
  (!keyring&&proof.version!==VERSION)||
  !valid(proof)||!NOW(now)||now<proof.issuedAt||
  now>=proof.expiresAt||proof.issuedAt<now-TTL||
  proof.issuer!==expectedIssuer||proof.audience!==expectedAudience||
  proof.repositoryId!==expectedRepositoryId||
  proof.ownerId!==expectedOwnerId||proof.requestId!==expectedRequestId||
  proof.decision!==expectedDecision||typeof proof.signature!=="string"||
  !/^[A-Za-z0-9_-]{86}$/.test(proof.signature||"")||
  typeof nonceStore?.claimOnce!=="function")
  return blocked("invalid_or_expired_proof");
 try{
  const selected=keyring?keyring.verificationKeyAt?.(proof.keyId,proof.issuedAt,now):publicKey;
  if(!selected)return blocked("unknown_or_retired_key");
  const pub=selected?.type==="public"?selected:createPublicKey(selected);
  if(pub.asymmetricKeyType!=="ed25519"||
   !verify(null,payload(proof),pub,Buffer.from(proof.signature,"base64url")))
   return blocked("invalid_signature");
  // Independent server-side atomic claim; never accept a local in-memory
  // replay cache when requests can arrive at multiple app instances.
  if(await nonceStore.claimOnce({nonce:proof.nonce,expiresAt:proof.expiresAt,
   repositoryId:proof.repositoryId})!==true)
   return blocked("replayed_or_unavailable");
  return Object.freeze({verified:true,ownerId:proof.ownerId,
   repositoryId:proof.repositoryId,requestId:proof.requestId,
   decision:proof.decision,...flags()});
 }catch{return blocked("verification_unavailable");}
}
module.exports={issueOwnerEdgeProof,verifyOwnerEdgeProof,TTL};
