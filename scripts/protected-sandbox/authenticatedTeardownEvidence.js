'use strict';
const {createPublicKey,KeyObject,createHash,verify}=require('node:crypto');
const fields=['repositoryId','runId','runAttempt','headSha','workflowBlob','harnessBlob','imageManifest','publisherEvidence','runnerIdentityDigest'];
const roles=['runner','publisher'];
const claims={runner:['lifecycle','quarantineCleared','residualCount'],publisher:['provenanceVerified','sourceProtected']};
const hex=(v,n)=>typeof v==='string'&&v.length===n&&/^[a-f0-9]+$/.test(v);
const digest=v=>createHash('sha256').update(v).digest('hex');
function publicOnly(value){
 if(value instanceof KeyObject){if(value.type!=='public')throw Error('Public key required');}
 else if(typeof value!=='string'||!/^-----BEGIN PUBLIC KEY-----\r?\n/.test(value))throw Error('Public key required');
 const key=value instanceof KeyObject?value:createPublicKey(value);
 if(key.asymmetricKeyType!=='ed25519')throw Error('Ed25519 required');
 return key;
}
// Offline verification only. Caller must supply independently protected public pins,
// expected scope, and a fresh challenge from outside the candidate runner.
function verifyTeardownEvidence({expected,challenge,runner,publisher,trust,now=Math.floor(Date.now()/1000)}={}){
 const deny=reason=>Object.freeze({authenticated:false,reconciled:false,reason,executionAuthorized:false,attestation:false});
 try{
 if(!expected||!hex(challenge,64)||!Number.isSafeInteger(now))return deny('invalid challenge or scope');
 for(const k of fields){const v=expected[k];if(['repositoryId','runId','runAttempt'].includes(k)?!Number.isSafeInteger(v)||v<1:!hex(v,['headSha','workflowBlob','harnessBlob'].includes(k)?40:64))return deny('invalid scope');}
 const pins=roles.map(role=>{const t=trust[role];const key=publicOnly(t.publicKey);return {key,authority:t.authority,fingerprint:digest(key.export({type:'spki',format:'der'}))};});
 if(pins.some((p,i)=>typeof p.authority!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(p.authority)||p.fingerprint!==trust[roles[i]].fingerprint)||pins[0].authority===pins[1].authority||pins[0].fingerprint===pins[1].fingerprint)return deny('independent pinned keys required');
 const payloads=[];
 for(const [i,envelope] of [runner,publisher].entries()){
 const role=roles[i],r=envelope?.record;
 const names=[...fields,'authority','challenge','issuedAt','expiresAt',...claims[role]];
 if(!r||Object.keys(r).sort().join(',')!==names.slice().sort().join(',')||!hex(envelope.signature,128))return deny('invalid evidence envelope');
 if(!fields.every(k=>r[k]===expected[k])||r.authority!==pins[i].authority||r.challenge!==challenge)return deny('evidence scope mismatch');
 if(!Number.isSafeInteger(r.issuedAt)||!Number.isSafeInteger(r.expiresAt)||r.issuedAt>now||r.expiresAt<=now||r.expiresAt-r.issuedAt>120)return deny('stale evidence');
 const payload=JSON.stringify(['alphine-sandbox-evidence-v1',role,...names.map(k=>r[k])]);
 if(!verify(null,Buffer.from(payload),pins[i].key,Buffer.from(envelope.signature,'hex')))return deny('signature rejected');
 if(role==='runner'&&(r.lifecycle!=='destroyed'||r.quarantineCleared!==true||r.residualCount!==0))return deny('teardown unresolved');
 if(role==='publisher'&&(r.provenanceVerified!==true||r.sourceProtected!==true))return deny('provenance unresolved');
 payloads.push(payload);
 }
 return Object.freeze({authenticated:true,reconciled:false,reason:'independent operational acceptance required',evidenceDigest:digest(JSON.stringify(payloads)),executionAuthorized:false,attestation:false});
 }catch{return deny('verification unavailable');}
}
module.exports={verifyTeardownEvidence};
