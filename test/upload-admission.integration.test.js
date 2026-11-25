'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {withUploadAdmission}=require('../src/security/uploadAdmission');
test('distributed admission enforces tenant and global concurrency and releases after errors', {skip:process.env.RUN_UPLOAD_ADMISSION_CI!=='1',timeout:20000}, async t=>{
 const url=new URL(process.env.UPLOAD_ADMISSION_CI_DATABASE_URL);
 assert.equal(url.hostname,'127.0.0.1');
 assert.equal(url.pathname,'/aca_upload_admission_ci');
 const pools=[new Pool({connectionString:url.toString(),max:8}),new Pool({connectionString:url.toString(),max:8})];
 let release;
 const hold=new Promise(resolve=>{release=resolve;});
 const running=[];
 t.after(async()=>{release();await Promise.allSettled(running);await Promise.all(pools.map(p=>p.end()));});
 for(let i=0;i<4;i++){
   let entered;
   const ready=new Promise(resolve=>{entered=resolve;});
   const run=withUploadAdmission(pools[i%2],'tenant-'+i,async()=>{entered();await hold;});
   running.push(run);
   await Promise.race([ready,run.then(()=>{throw Error('unexpected early return');})]);
 }
 assert.deepEqual(await withUploadAdmission(pools[1],'tenant-0',()=>assert.fail('duplicate admitted')),{admitted:false});
 assert.deepEqual(await withUploadAdmission(pools[0],'tenant-4',()=>assert.fail('fifth admitted')),{admitted:false});
 release();
 assert.ok((await Promise.all(running)).every(x=>x.admitted));
 await assert.rejects(withUploadAdmission(pools[0],'tenant-0',async()=>{throw Error('fixture error');}),/fixture error/);
 assert.deepEqual(await withUploadAdmission(pools[1],'tenant-0',async()=>42),{admitted:true,result:42});
});

test('disposable database connection loss aborts admission and releases locks', {skip:process.env.RUN_UPLOAD_ADMISSION_CI!=='1',timeout:15000}, async t=>{
 const url=new URL(process.env.UPLOAD_ADMISSION_CI_DATABASE_URL);
 assert.equal(url.hostname,'127.0.0.1');
 assert.equal(url.pathname,'/aca_upload_admission_ci');
 const owner=new Pool({connectionString:url.toString(),max:2});
 const observer=new Pool({connectionString:url.toString(),max:2});
 t.after(async()=>{await Promise.all([owner.end(),observer.end()]);});
 let pid;
 const wrapped={async connect(){
   const c=await owner.connect();
   try {pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;return c;}
   catch(e){c.release(true);throw e;}
 }};
 let sawAbort=false;
 await assert.rejects(withUploadAdmission(wrapped,'connection-loss-fixture',async signal=>{
   const aborted=new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
   assert.equal((await observer.query('SELECT pg_terminate_backend($1) AS terminated',[pid])).rows[0].terminated,true);
   await aborted;
   sawAbort=signal.aborted;
 }),/connection|terminat|closed/i);
 assert.equal(sawAbort,true);
 assert.deepEqual(await withUploadAdmission(observer,'connection-loss-fixture',async()=>42),{admitted:true,result:42});
});
