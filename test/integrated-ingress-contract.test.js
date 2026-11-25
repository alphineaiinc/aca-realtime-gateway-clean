const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {ingressLimit}=require('../src/security/ingressLimit');
test('aggregate ingress budget spans identities and resets',()=>{let now=0;const limit=ingressLimit({max:2,globalBudget:true,clock:()=>now,windowMs:1000});let passed=0;const res={status(n){this.code=n;return this},json(){return this},set(){return this}};for(const ip of ['a','b','c'])limit({ip},res,()=>passed++);assert.equal(passed,2);assert.equal(res.code,429);now=1000;limit({ip:'d'},res,()=>passed++);assert.equal(passed,3);});
test('global protection mounted before routes and parsers; fixed hop trust removed',()=>{const src=fs.readFileSync(require.resolve('../index.js'),'utf8');const first=src.indexOf('app.use((req,res,next)=>aggregateIngressBudgets');assert.ok(first>0&&first<src.indexOf('app.use('+'securityHeaders'));assert.ok(first<src.indexOf('app.use(express.json'));assert.ok(src.includes('app.use(recognizedRateLimit('));assert.doesNotMatch(src,/app\.set\(["']trust proxy["'],\s*1\)/);});
