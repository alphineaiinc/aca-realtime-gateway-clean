'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSpendBudget}=require('../src/automation/engineeringTeam/spendBudget');
const {createCallBudget}=require('../src/automation/engineeringTeam/callBudget');
const scope={product:'aca',repository:'fixture/aca',budgetId:'123e4567-e89b-12d3-a456-426614174000'};
function fixture({denied=false,rollbackFailure=false}={}){
 const calls=[];let released;
 const query=async(sql,params)=>{calls.push({sql,params});if(sql==='ROLLBACK'&&rollbackFailure)throw Error('rollback failed');return {rowCount:sql.startsWith('UPDATE')?(denied?0:1):0,rows:[]};};
 return {calls,pool:{query,connect:async()=>({query,release(discard){released=discard;}})},released:()=>released};
}
test('spend budget rejects coerced or unknown models before database access',async()=>{
 const f=fixture();const budget=createSpendBudget({...scope,pool:f.pool,ceilings:{fixture:5}});
 for(const model of [['fixture'],{toString:()=> 'fixture'},undefined,'unknown'])await assert.rejects(budget.reserve({model}),/Unknown model ceiling/);
 assert.deepEqual(f.calls,[]);
});
test('spend budget snapshots ceilings and enforces stop, quarantine and both caps without granting dispatch',async()=>{
 const f=fixture(),ceilings={fixture:5};const budget=createSpendBudget({...scope,pool:f.pool,ceilings});ceilings.fixture=1;
 assert.equal(await budget.reserve({model:'fixture'}),true);
 const update=f.calls.find(x=>x.sql.startsWith('UPDATE'));
 assert.deepEqual(update.params,[scope.product,scope.repository,scope.budgetId,5]);
 for(const pattern of [/reserved_calls<max_calls/,/reserved_microusd\+\$4<=max_microusd/,/engineering_team_stops/,/engineering_team_quarantine/])assert.match(update.sql,pattern);
 assert.equal(await budget.consume(),false);assert.equal(f.released(),false);
});
test('denied spend reservation rolls back and discards on rollback failure',async()=>{
 for(const rollbackFailure of [false,true]){const f=fixture({denied:true,rollbackFailure});const budget=createSpendBudget({...scope,pool:f.pool,ceilings:{fixture:5}});await assert.rejects(budget.reserve({model:'fixture'}),/Spend budget denied/);assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.equal(f.released(),rollbackFailure);assert.ok(!f.calls.some(x=>x.sql==='COMMIT'));}
});
test('exhausted standalone call counter denies reservation',async()=>{
 const f=fixture({denied:true});const budget=createCallBudget({...scope,pool:f.pool});await assert.rejects(budget.reserve(),/Durable call budget denied/);assert.match(f.calls[0].sql,/reserved_calls<max_calls/);
});
