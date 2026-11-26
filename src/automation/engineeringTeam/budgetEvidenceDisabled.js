'use strict';
const {verify,createHash,createPublicKey}=require('node:crypto');
// Offline verifier only. Trust keys must be supplied by independent custody.
function authenticate(envelope,keys,expected,now){
 if(!Number.isSafeInteger(now)||!envelope||typeof envelope.payload!=='string'||typeof envelope.signature!=='string'||!Object.hasOwn(keys,envelope.keyId))throw Error('Untrusted evidence');
 const key=createPublicKey(keys[envelope.keyId]);
 if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(envelope.payload),key,Buffer.from(envelope.signature,'base64')))throw Error('Invalid signature');
 const p=JSON.parse(envelope.payload);
 if(!Number.isSafeInteger(p.issuedAt)||!Number.isSafeInteger(p.expiresAt)||p.issuedAt>now||p.expiresAt<=now||p.expiresAt<=p.issuedAt)throw Error('Stale evidence');
 for(const [k,v] of Object.entries(expected))if(p[k]!==v)throw Error('Evidence scope mismatch');
 return {payload:p,digest:createHash('sha256').update(envelope.payload).digest('hex')};
}
// Sort object keys recursively and preserve array order, including after JSONB decoding.
function canonicalJSON(value) {
 if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
 if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
 if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
 if (value && Object.getPrototypeOf(value) === Object.prototype) {
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJSON(value[key])).join(',') + '}';
 }
 throw Error('Invalid ledger JSON');
}

function ledgerDigest(ledger) {
 return createHash('sha256').update(canonicalJSON(ledger)).digest('hex');
}

module.exports = {authenticate, ledgerDigest};
