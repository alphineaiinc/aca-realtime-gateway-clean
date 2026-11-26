'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createInterlock}=require('./budgetInterlockDisabled');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const keys={test:publicKey.export({type:'spki',format:'pem'})};
function fixture(){let state={version:0,pending:null};const store={async read(){return structuredClone(state)},async compareAndSet(a,b){if(JSON.stringify(a)!==JSON.stringify(state))return false;state=structuredClone(b);return true}};return {store,keys,clock:()=>1000}}
function proof(patch={}){const payload=JSON.stringify({kind:'transaction-reconciliation',id:'a',version:1,reservationsRetained:true,ledgerReconciled:true,outcome:'committed',issuedAt:900,expiresAt:1100,...patch});return {keyId:'test',payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')}}
test('concurrent admission and recreated adapter deny pending operation',async()=>{const f=fixture(),a=createInterlock(f);const r=await Promise.allSettled([a.begin('a'),a.begin('b')]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);await assert.rejects(createInterlock(f).begin('c'),/blocked/)});
test('signed exact reconciliation clears interlock and rejects replay',async()=>{const f=fixture(),a=createInterlock(f);await a.begin('a');for(const patch of [{version:0},{outcome:'unknown'},{reservationsRetained:false}])await assert.rejects(a.reconcile(proof(patch)));assert.equal((await a.reconcile(proof())).executionAuthorized,false);await assert.rejects(a.reconcile(proof()));await a.begin('b')});
test('missing roots or store deny construction',()=>{assert.throws(()=>createInterlock({...fixture(),keys:{}}));assert.throws(()=>createInterlock({keys}))});
