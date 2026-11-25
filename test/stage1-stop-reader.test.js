'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {stopReader}=require('../.github/scripts/stage1-stop-reader');
const scope={product:'aca',repository:'alphineaiinc/aca-realtime-gateway-clean',sha:'6678909c7e9e60c08b0bc56c150e9031900a3984'};
test('explicit enable only; stop and blocked override; errors deny',async()=>{
 for(const [labels,expected] of [[[],true],[['aca:stage1/enabled'],false],[['aca:stage1/enabled','aca:stage1/stop'],true],[['aca:stage1/enabled','aca:auto/blocked'],true]]){
  const reader=stopReader('fixture',async(url,opts)=>{assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');return {ok:true,json:async()=>({number:118,state:'open',labels:labels.map(name=>({name}))})};});
  assert.equal(await reader(scope),expected);
  assert.equal(await reader({...scope,sha:'0'.repeat(40)}),true);
 }
 assert.equal(await stopReader('fixture',async()=>{throw Error('offline')})(scope),true);
});
