'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPersistentBudget}=require('./persistentMonthlyBudgetDisabled');
const now=Date.parse('2026-11-26T17:00:00Z'),month='2026-11';
const req=(id='a')=>({id,month,workCents:8000,cleanupCents:1000,evidenceSha256:'a'.repeat(64),expiresAt:now+10000});
function fixture({bad=false,failCommit=false}={}){
 let state={month,reconciled:true,fixedAndAccruedCents:0,entries:[]},tail=Promise.resolve();
 const pool={async connect(){let unlock,staged;return {async query(sql,args){
 if(sql==='BEGIN')return {};
 if(sql.includes('pg_advisory')){const prev=tail;tail=new Promise(r=>{unlock=r});await prev;return {};}
 if(sql.startsWith('SELECT state'))return {rowCount:1,rows:[{state:structuredClone(state)}]};
 if(sql.startsWith('UPDATE')){staged=JSON.parse(args[1]);return {rowCount:1};}
 if(sql==='COMMIT'){state=staged;unlock?.();unlock=null;if(failCommit)throw Error('ambiguous commit');return {};}
 if(sql==='ROLLBACK'){unlock?.();unlock=null;return {};}
 throw Error('unexpected SQL');},release(){unlock?.();}}}};
 const verifyEvidence=async({request,state})=>({...request,verified:!bad,fixedAndAccruedCents:state.fixedAndAccruedCents});
 return {pool,verifyEvidence,clock:()=>now,state:()=>state};
}
test('serialized adapter requests cannot exceed aggregate cap in mock transaction model',async()=>{const f=fixture(),b=createPersistentBudget(f);const r=await Promise.allSettled([b.reserve(req('a')),b.reserve(req('b'))]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.state().entries.length,1);assert.equal(r.find(x=>x.status==='fulfilled').value.executionAuthorized,false);});
test('invalid evidence rolls back',async()=>{const f=fixture({bad:true});await assert.rejects(createPersistentBudget(f).reserve(req()),/Evidence denied/);assert.equal(f.state().entries.length,0);});
test('ambiguous committed reservation cannot replay',async()=>{const f=fixture({failCommit:true}),b=createPersistentBudget(f);await assert.rejects(b.reserve(req()),/ambiguous commit/);assert.equal(f.state().entries.length,1);await assert.rejects(b.reserve(req()),/Budget denied/);});
test('mismatched evidence cost denied',async()=>{const f=fixture(),verify=f.verifyEvidence;f.verifyEvidence=async x=>({...await verify(x),cleanupCents:1});await assert.rejects(createPersistentBudget(f).reserve(req()),/Evidence denied/);assert.equal(f.state().entries.length,0);});
