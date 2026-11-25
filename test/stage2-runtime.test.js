'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {run}=require('../.github/scripts/stage2-runtime');
const config='a'.repeat(40),expires=2000,marker='<!-- aca-stage2:enable:'+config+':'+expires+' -->';
const context={event:'schedule',ref:'refs/heads/main',attempt:'1',repository:'alphineaiinc/aca-realtime-gateway-clean',approved:config,config,enabled:'true',expires};
const base={number:153,state:'open',body:marker,labels:[{name:'aca:auto/blocked'}]};
const result={status:'observed',executionAuthorized:false,writeAuthorized:false,deployAuthorized:false,paidProviderAuthorized:false};
test('separate control and pinned runtime invocation',async()=>{let reads=0;const actual=await run({context,token:'fixture',clock:()=>1000,fetchImpl:async(url,o)=>{assert.match(url,/issues\/153$/);assert.equal(o.method,'GET');reads++;return {ok:true,json:async()=>base}},observeOnce:async({env,readStopState})=>{assert.equal(env.ACA_RESTRICTED_MANAGER_HEAD_SHA,'6678909c7e9e60c08b0bc56c150e9031900a3984');assert.equal(env.ACA_RESTRICTED_MANAGER_ISSUE,'118');assert.equal(await readStopState({repository:context.repository,sha:env.ACA_RESTRICTED_MANAGER_HEAD_SHA,product:'aca'}),false);return result}});assert.deepEqual(actual,result);assert.equal(reads,3)});
test('stage1, duplicate, wrong expiry and coding allowlist deny',async()=>{for(const d of [{...base,body:'<!-- aca-stage1:enable:'+config+' -->'},{...base,body:marker+'\n'+marker},{...base,body:marker.replace(':2000',':3000')},{...base,labels:[...base.labels,{name:'aca:auto/docs-test'}]}])assert.deepEqual(await run({context,token:'fixture',clock:()=>1000,fetchImpl:async()=>({ok:true,json:async()=>d}),observeOnce:()=>assert.fail()}),{status:'denied'})});
