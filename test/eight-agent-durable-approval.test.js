'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createDurableApprovalPolicy}=require('../src/automation/engineeringTeam/durableApproval');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
test('durable approval identity is checked against captured scope when caller mutates during authentication',async()=>{
 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 const calls=[];
 const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[{id:params[0],binding:params[6],state:'pending',expires_at:'later'}]};}};
 const policy=createDurableApprovalPolicy({pool,scopes:[scope],authenticate:async()=>pending});
 const mutableScope={...scope};
 const request=policy.request({scope:mutableScope,operation:'provider.activate',evidence:'b'.repeat(64),credential:'mutating'});
 mutableScope.product='other-product';
 release({...scope,product:'other-product',id:'attacker',permission:'queue.manage'});
 await assert.rejects(request,/Identity denied/);
 assert.equal(calls.length,0);
});
test('durable approval retains exact scope and never grants execution authorization',async()=>{
 const calls=[];
 const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[{id:params[0],binding:params[6],state:'pending',expires_at:'later'}]};}};
 const policy=createDurableApprovalPolicy({pool,scopes:[scope],authenticate:async()=>({...scope,id:'manager',permission:'queue.manage'})});
 const result=await policy.request({scope:{...scope},operation:'provider.activate',evidence:'c'.repeat(64),credential:'manager'});
 assert.equal(result.executionAuthorized,false);
 assert.deepEqual(calls[0].params.slice(1,4),[scope.product,scope.repository,scope.sha]);
 assert.equal(policy.executionAllowed(),false);
});
