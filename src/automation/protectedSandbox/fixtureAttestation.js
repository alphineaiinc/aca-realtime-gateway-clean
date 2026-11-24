'use strict';
const {createPublicKey,verify}=require('node:crypto');
const {inspectFixedFixtureReport}=require('./fixtureReport');
// Candidate verification contract. Key provisioning and durable receipt storage
// are external trust boundaries; no signing or execution authority is supplied.
function createFixtureAttestationVerifier({publicKey,expected,consumeReceipt}={}){
 if(!expected||typeof consumeReceipt!=='function')throw Error('Invalid attestation verifier');
 const key=createPublicKey(publicKey);
 if(key.asymmetricKeyType!=='ed25519')throw Error('Invalid attestation key');
 const pinned=Object.freeze({harnessSha:expected.harnessSha,image:expected.image,fixtureSha256:expected.fixtureSha256,attemptId:expected.attemptId});
 if(typeof pinned.harnessSha!=='string'||!/^[a-f0-9]{40}$/.test(pinned.harnessSha)||typeof pinned.image!=='string'||!/^node@sha256:[a-f0-9]{64}$/.test(pinned.image)||typeof pinned.fixtureSha256!=='string'||!/^[a-f0-9]{64}$/.test(pinned.fixtureSha256)||typeof pinned.attemptId!=='string'||!/^aca-fixture-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(pinned.attemptId))throw Error('Invalid attestation expectations');
 let consumed=false,active=false;
 const denied=()=>Object.freeze({status:'denied',executionAuthorized:false});
 return Object.freeze({async inspect({report,signature}={}){
  if(active||consumed)return denied();
  active=true;
  try{
   const screened=inspectFixedFixtureReport(report,pinned);
   if(screened.status!=='integrity-checked'||typeof signature!=='string'||!/^[a-f0-9]{128}$/.test(signature))return denied();
   const receipt=Object.freeze({...pinned,reportSha256:screened.reportSha256});
   const message=Buffer.from('alphine:fixed-sandbox-attestation:v1\n'+JSON.stringify(receipt),'utf8');
   if(!verify(null,message,key,Buffer.from(signature,'hex')))return denied();
   // Consume only after exact binding and signature verification. An unknown
   // storage outcome consumes this local verifier and requires reconciliation.
   consumed=true;
   if(await consumeReceipt(receipt)!==true)return denied();
   return Object.freeze({status:'signature-verified',reportSha256:receipt.reportSha256,provenance:'configured-key-and-receipt-callback',executionAuthorized:false});
  }catch{return denied();}
  finally{active=false;}
 }});
}
module.exports={createFixtureAttestationVerifier};
