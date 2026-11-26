'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCiEventAdmission}=require('../src/automation/engineeringTeam/ciEventAdmission');
const {createCorrectionAdmission}=require('../src/automation/engineeringTeam/correctionAdmission');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
for(const kind of ['ci','correction']){
 for(const scenario of ['valid','revoked','different actor','wrong scope','wrong permission','mutated original actor','authentication error']){
  test(kind+' admission reauthenticates under lock: '+scenario,async()=>{
   const queries=[];let calls=0,locked=false,released=false;
   const original={...scope,id:'manager',permission:'queue.manage'};
   const pool={async connect(){return {async query(sql,params){
    queries.push({sql,params});
    if(sql.startsWith('SELECT pg_advisory')){locked=true;if(scenario==='mutated original actor')original.id='other';}
    if(sql.startsWith('SELECT EXISTS'))return {rows:[{blocked:false}]};
    return {rowCount:1,rows:[]};
   },release(){released=true;}};}};
   const authenticate=async()=>{calls++;if(calls===1)return original;assert.equal(locked,true);
    if(scenario==='revoked')return null;
    if(scenario==='authentication error')throw Error('auth unavailable');
    return {...scope,id:scenario==='different actor'||scenario==='mutated original actor'?'other':'manager',permission:scenario==='wrong permission'?'queue.read':'queue.manage',product:scenario==='wrong scope'?'other':scope.product};
   };
   const options={pool,scope,authenticate,credential:'fixture',workflowId:1};
   const admit=kind==='ci'?createCiEventAdmission(options):createCorrectionAdmission(options);
   const input=kind==='ci'?{scope,workflowId:1,runId:2,attempt:1}:{taskId:'123e4567-e89b-12d3-a456-426614174000',initialDigest:'b'.repeat(64)};
   if(scenario==='authentication error')await assert.rejects(admit(input),/auth unavailable/);
   else assert.equal(await admit(input),scenario==='valid');
   assert.equal(calls,2);assert.equal(released,true);
   const inserts=queries.filter(q=>q.sql.startsWith('INSERT'));
   assert.equal(inserts.length,scenario==='valid'?1:0);
   if(scenario==='valid')assert.equal(inserts[0].params.at(-1),'manager');
   assert.equal(queries.at(-1).sql,scenario==='valid'?'COMMIT':'ROLLBACK');
  });
 }
}
