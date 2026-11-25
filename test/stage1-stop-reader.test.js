'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {stopReader}=require('../.github/scripts/stage1-stop-reader');
const scope={product:'aca',repository:'alphineaiinc/aca-realtime-gateway-clean',sha:'6678909c7e9e60c08b0bc56c150e9031900a3984'};
const config='a'.repeat(40),marker='<!-- aca-stage1:enable:'+config+' -->';
const base={number:153,state:'open',body:marker,labels:[{name:'aca:auto/blocked'}]};
const read=(data,token='fixture',revision=config)=>stopReader(token,revision,async(url,opts)=>{assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');return {ok:true,json:async()=>data};});
test('only exact unique body enable marker with coding denial permits',async()=>{
 assert.equal(await read(base)(scope),false);
 for(const body of ['',null,marker+'\n'+marker,' '+marker,marker.replace(config,'b'.repeat(40)),marker+'\n<!-- aca-stage1:stop -->','<!-- aca-stage1:stop -->'])assert.equal(await read({...base,body})(scope),true);
 for(const labels of [[],...['aca:stage1/stop','aca:stage1/enabled','ACA:AUTO/DOCS-TEST'].map(name=>[...base.labels,{name}])])assert.equal(await read({...base,labels})(scope),true);
});
test('scope, issue identity, missing token, config and transport errors deny',async()=>{
 for(const d of [{...base,number:118},{...base,state:'closed'},{...base,pull_request:{}},{...base,labels:null}])assert.equal(await read(d)(scope),true);
 assert.equal(await read(base)({...scope,sha:'0'.repeat(40)}),true);
 assert.equal(await read(base,'')(scope),true);
 assert.equal(await read(base,'fixture','bad')(scope),true);
 assert.equal(await stopReader('fixture',config,async()=>{throw Error('offline')})(scope),true);
});
