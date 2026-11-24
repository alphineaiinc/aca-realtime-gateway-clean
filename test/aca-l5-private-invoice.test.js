const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
test('invoice copy is tenant scoped and CSV formulas escaped',async t=>{
 process.env.JWT_SECRET='disposable-test-only-secret';
 const p=require.resolve('../src/db/pool');
 const row={id:5,amount_usd:'10.00',status:'paid',generated_at:'2026-01-01',payment_reference:'=1+1'};
 require.cache[p]={id:p,filename:p,loaded:true,exports:{query:async(sql,args)=>{
 if(sql.includes('WHERE id=$1 AND tenant_id=$2'))return {rows:args[0]===5&&args[1]===7?[row]:[]};
 assert.equal(args[0],7);return {rows:[row]};
 }}};
 const app=express();app.use(require('../src/routes/billing'));
 const server=app.listen(0,'127.0.0.1');t.after(()=>new Promise(r=>server.close(r)));
 await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const get=(path,tenant)=>fetch(base+path,{headers:tenant?{authorization:'Bearer '+jwt.sign({tenant_id:tenant},process.env.JWT_SECRET)}:{}});
 assert.equal((await get('/document/5')).status,401);
 assert.equal((await get('/document/5',8)).status,404);
 assert.equal((await get('/document/5x',7)).status,400);
 const res=await get('/document/5',7);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 const csv=await (await get('/export',7)).text();assert.ok(csv.includes("'=1+1"));assert.ok(!csv.includes('invoice_path'));
});
