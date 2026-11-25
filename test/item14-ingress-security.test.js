const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.js'),'utf8');
test('ingress limiter bounds identities, rejects excess and fails closed',()=>{
 const start=source.indexOf('function createRateLimiter(');
 const end=source.indexOf('const {createPostgresRateLimiter}',start);
 assert.ok(start>=0&&end>start);
 const factory=vm.runInNewContext(source.slice(start,end)+';createRateLimiter',{Date,Map,console:{warn(){}},setInterval:()=>({unref(){}})});
 const limiter=factory({windowMs:60000,max:2,keyFn:r=>r.ip});
 let status=0,passed=0;
 const res={status(n){status=n;return this;},json(){}};
 const next=()=>passed++;
 limiter({ip:'a'},res,next);limiter({ip:'a'},res,next);limiter({ip:'a'},res,next);
 assert.equal(passed,2);assert.equal(status,429);
 for(let i=0;i<9999;i++)limiter({ip:'fixture-'+i},res,next);
 limiter({ip:'overflow'},res,next);assert.equal(status,503);
 factory({windowMs:60000,max:2,keyFn(){throw Error('fixture');}})({},res,next);assert.equal(status,503);
});
test('historical ingress controls precede route mounts',()=>{
 for(const [guard,mount] of [['app.use("/api/stripe/webhook", stripeIngressLimit)','app.use("/api/stripe", require'],['app.use("/tenant/upload-knowledge", uploadIngressLimit)','app.use("/", uploadKnowledgeRoutes)']]){
 assert.ok(source.includes(guard));assert.ok(source.indexOf(guard)<source.indexOf(mount));
 }
 for(const route of ['/monitor/twilio-debug','/monitor/resilience','/monitor/deploy-matrix'])assert.ok(source.includes('app.get("'+route+'", requireAdmin, monitorLimit,'));
});
