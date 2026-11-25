'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../src/routes',name),'utf8');
test('partner dashboard and legal routes apply shared IP budgets before handlers',()=>{
 for(const [file,count,scope] of [['partnerDashboard.js',3,'partner-dashboard-ip'],['partnerLegal.js',2,'partner-legal-ip']]){
  const source=read(file);
  assert.ok(source.includes("scope: '"+scope+"', max: 30, ipBased: true"));
  const routes=source.split('\n').filter(line=>/router\.(get|post)\(/.test(line));
  assert.equal(routes.length,count);
  for(const route of routes)assert.match(route,/ingressRateLimit, sharedIpLimit,/);
 }
 assert.doesNotMatch(read('partnerLegal.js'),/headers\["x-forwarded-for"\]/);
});
