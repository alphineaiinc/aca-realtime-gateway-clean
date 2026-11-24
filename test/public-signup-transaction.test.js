
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/routes/public.js'),'utf8');
function fixture(failBusiness=false,failRollback=false){
 const calls=[], routes={};let tls, released;
 const client={async query(sql){calls.push(sql.trim().split(/\s+/).slice(0,3).join(' '));if(sql.includes('INSERT INTO businesses')&&failBusiness)throw Error('fixture failure');if(sql==='ROLLBACK'&&failRollback)throw Error('rollback failure');return {rows:[{id:1,email:'fixture@example.invalid'}]};},release(discard){released=discard;}};
 const router={post(p,fn){routes[p]=fn},get(p,fn){routes[p]=fn}};
 const context={module:{exports:{}},__dirname:'/fixture/src/routes',process:{env:{DATABASE_URL:'fixture',TENANT_JWT_SECRET:'fixture-only'}},console:{error(){}},require(name){if(name==='express')return {Router:()=>router};if(name==='pg')return {Pool:class{constructor(opts){tls=opts.ssl}async connect(){return client}}};if(name==='jsonwebtoken')return {sign:()=> 'fixture-token'};if(name==='node:crypto')return {randomBytes:()=>Buffer.alloc(32)};if(name==='dotenv')return {config(){}};if(name==='path')return path;throw Error(name);}};
 vm.runInNewContext(source,context);
 const res={code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}};
 return {calls,routes,res,tls,released:()=>released};
}
test('signup commits both inserts before returning credentials with verified TLS',async()=>{
 const f=fixture();await f.routes['/public/signup']({body:{email:'fixture@example.invalid',business_name:'fixture'}},f.res);
 assert.equal(f.tls.rejectUnauthorized,true);assert.deepEqual(f.calls,['BEGIN','INSERT INTO master_tenants','INSERT INTO businesses','COMMIT']);assert.equal(f.res.body.token,'fixture-token');assert.equal(f.released(),false);
});
test('failed business insert rolls back and never returns credentials',async()=>{
 for(const failRollback of [false,true]){const f=fixture(true,failRollback);await f.routes['/public/signup']({body:{email:'fixture@example.invalid',business_name:'fixture'}},f.res);assert.deepEqual(f.calls,['BEGIN','INSERT INTO master_tenants','INSERT INTO businesses','ROLLBACK']);assert.equal(f.res.code,500);assert.equal(f.res.body.token,undefined);assert.equal(f.released(),failRollback);}
});
test('email alone cannot authenticate',async()=>{const f=fixture();await f.routes['/public/login']({body:{email:'fixture@example.invalid'}},f.res);assert.equal(f.res.code,403);assert.equal(f.res.body.token,undefined);assert.deepEqual(f.calls,[]);});
