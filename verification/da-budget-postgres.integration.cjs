'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Pool} = require('pg');
const {randomUUID} = require('node:crypto');
const {schemaSQL,serialize,transaction,readInterlock,changeInterlock,readLedgers} = require('../src/automation/engineeringTeam/pgBudgetInterlockDisabled');
const {schemaSQL:ledgerSQL,writeLedger} = require('../src/automation/engineeringTeam/persistentMonthlyBudgetDisabled');
const {monthAt} = require('../src/automation/engineeringTeam/aggregateMonthlyBudgetDisabled');
const url = process.env.DA_BUDGET_TEST_DATABASE_URL;
test('disposable PostgreSQL budget adapter verification', {timeout:60000}, async t => {
 assert.equal(process.env.DA_BUDGET_TEST_ONLY,'1');
 assert.ok(url);
 const u = new URL(url);
 assert.equal(u.hostname,'127.0.0.1');
 assert.equal(u.pathname,'/da_budget_disposable');
 assert.equal(u.username,'da_budget_test');
 const schema = 'budget_'+randomUUID().replaceAll('-','');
 const admin = new Pool({connectionString:url,connectionTimeoutMillis:3000});
 let pool;
 try {
  await admin.query('CREATE SCHEMA '+schema);
  pool = new Pool({connectionString:url,options:'-c search_path='+schema+' -c statement_timeout=5000 -c lock_timeout=4000',max:4,connectionTimeoutMillis:3000});
  await pool.query(schemaSQL);
  await pool.query(ledgerSQL);
  const now = Date.now(), month = monthAt(now), next = monthAt(now+35*86400000);
  const initial = m => ({month:m,entries:[],reconciled:true,fixedAndAccruedCents:0});
  async function reset(){
   await pool.query('DELETE FROM da_budget_interlock_disabled');
   await pool.query('DELETE FROM da_monthly_budget_disabled');
   await pool.query('INSERT INTO da_budget_interlock_disabled VALUES(true,0,NULL)');
   for(const m of [month,next]) await pool.query('INSERT INTO da_monthly_budget_disabled VALUES($1,$2)',[m,initial(m)]);
  }
  await t.test('physical session affinity and concurrent serialization',async()=>{
   await reset();
   const order=[];
   await Promise.all([1,2].map(i=>serialize(pool,async c=>{
    order.push('start'+i);
    const pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    for(let j=0;j<3;j++) await transaction(c,async()=>{
     assert.equal((await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,pid);
     const state=await readInterlock(c,{lock:true});
     await changeInterlock(c,state,null);
    });
    order.push('end'+i);
   })));
   assert.equal(order[1],order[0].replace('start','end'));
   assert.equal((await readInterlock(pool)).version,6);
  });
  await t.test('disconnect releases advisory lock',async()=>{
   const c=await pool.connect();
   try{await c.query('SELECT pg_advisory_lock(172150,189)');}finally{c.release(true);}
   await serialize(pool,async()=>{});
  });
  await t.test('multi-row rollback retains committed pending marker',async()=>{
   await reset();
   await serialize(pool,async c=>{
    await transaction(c,async()=>changeInterlock(c,await readInterlock(c),'pending'));
    await assert.rejects(transaction(c,async()=>{
     await readLedgers(c,{lock:true});
     await writeLedger(c,month,{...initial(month),entries:[{id:'a'}]},{expiresAt:Date.now()+30000,preparedMonth:month});
     await writeLedger(c,next,{...initial(next),entries:[{id:'a'}]},{expiresAt:Date.now()-1,preparedMonth:month});
    }),/Ledger update denied/);
   });
   assert.equal((await readInterlock(pool)).pending,'pending');
   assert.deepEqual(await readLedgers(pool),{[month]:initial(month),[next]:initial(next)});
  });
  for(const phase of [1,2,3]) for(const persisted of [false,true]){
   await t.test('commit boundary '+phase+' persisted='+persisted,async()=>{
    await reset();
    let commits=0;
    const faultPool={async connect(){
     const c=await pool.connect();
     return {release:()=>c.release(true),async query(sql,args){
      if(sql==='COMMIT' && ++commits===phase){
       if(persisted) await c.query(sql,args);
       else await c.query('ROLLBACK');
       throw Error('injected acknowledgement failure');
      }
      return c.query(sql,args);
     }};
    }};
    await assert.rejects(serialize(faultPool,async c=>{
     const marked=await transaction(c,async()=>changeInterlock(c,await readInterlock(c),'pending'));
     await transaction(c,async()=>{
      await readLedgers(c,{lock:true});
      await writeLedger(c,month,{...initial(month),entries:[{id:'a'}]},{expiresAt:Date.now()+30000,preparedMonth:month});
     });
     await transaction(c,()=>changeInterlock(c,marked,null));
    }),/injected acknowledgement failure/);
    const state=await readInterlock(pool);
    assert.equal(state.version,phase===1?(persisted?1:0):phase===3&&persisted?2:1);
    assert.equal(state.pending,phase===1&&!persisted||phase===3&&persisted?null:'pending');
    assert.equal((await readLedgers(pool))[month].entries.length,Number(phase===3||phase===2&&persisted));
    await serialize(pool,async()=>{});
   });
  }
 } finally {
  try {if(pool) await pool.end();} finally {
   try {await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');} finally {await admin.end();}
  }
 }
});
