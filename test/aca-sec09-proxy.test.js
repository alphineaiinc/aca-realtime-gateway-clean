'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getClientIp}=require('../src/db/demoGuards');
const {rateLimitIP,rateLimitKey}=require('../src/brain/utils/rateLimiters');
test('demo IP uses resolved address rather than caller supplied forwarding header',()=>{
 assert.equal(getClientIp({ip:'192.0.2.1',headers:{'x-forwarded-for':'192.0.2.2'}}),'192.0.2.1');
 assert.equal(getClientIp({socket:{remoteAddress:'::ffff:192.0.2.3'},headers:{'x-forwarded-for':'192.0.2.2'}}),'192.0.2.3');
});
test('legacy IP limiter ignores forwarding header rotation and fails closed',()=>{
 const limit=rateLimitIP({max:1,keyPrefix:'sec09-proxy-test'});
 function invoke(fn,req){let status=200;fn(req,{setHeader(){},status(n){status=n;return this;},json(){}},()=>{});return status;}
 assert.equal(invoke(limit,{ip:'192.0.2.1',headers:{'x-forwarded-for':'192.0.2.2'}}),200);
 assert.equal(invoke(limit,{ip:'192.0.2.1',headers:{'x-forwarded-for':'192.0.2.3'}}),429);
 assert.equal(invoke(rateLimitKey(()=>{throw Error('test');},{}),{}),503);
});
