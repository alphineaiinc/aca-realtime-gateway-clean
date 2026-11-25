'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const jwt=require('jsonwebtoken');
const {createIdentityVerifier}=require('../src/automation/engineeringTeam/identityVerifier');
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const p={id:'worker',product:'aca',repository:'fixture/aca',sha:'a'.repeat(40),permission:'queue.work',role:'backend-developer'};
const options={publicKey:publicKey.export({type:'spki',format:'pem'}),issuer:'fixture-issuer',audience:'fixture-team',principals:[p],isRevoked:async()=>false};
const token=(overrides={},opts={})=>jwt.sign({product:p.product,repository:p.repository,sha:p.sha,permission:p.permission,role:p.role,...overrides},privateKey,{algorithm:'RS256',issuer:options.issuer,audience:options.audience,subject:p.id,jwtid:'fixture-1',expiresIn:60,...opts});
test('signed short-lived identity maps to trusted worker registry',async()=>assert.deepEqual(await createIdentityVerifier(options)(token()),p));
test('wrong scope, privilege, issuer, expiry and revoked identity denied',async()=>{
 const verify=createIdentityVerifier(options);
 for(const t of [token({sha:'b'.repeat(40)}),token({permission:'owner.approval'}),token({}, {issuer:'other'}),token({}, {expiresIn:-1}),token({}, {expiresIn:600}), 'invalid'])assert.equal(await verify(t),null);
 assert.equal(await createIdentityVerifier({...options,isRevoked:async()=>true})(token()),null);
 assert.equal(await createIdentityVerifier({...options,isRevoked:async()=>{throw Error('unavailable');}})(token()),null);
});
