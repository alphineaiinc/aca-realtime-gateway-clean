'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('chat and brain routes enforce local and shared IP budgets before handlers',()=>{
 for(const [file,count,scope] of [['chat.js',1,'chat-ip'],['chat_stream.js',2,'chat-stream-ip'],['brain.js',1,'brain-ip']]){
  const source=read('src/routes/'+file);
  assert.ok(source.includes("scope: '"+scope+"', max: 30, ipBased: true"));
  const routes=source.split('\n').filter(line=>/router\.post\(/.test(line));
  assert.equal(routes.length,count);
  for(const route of routes)assert.match(route,/ingressRateLimit, sharedIpLimit,/);
 }
 const main=read('index.js');
 for(const route of ['/monitor/twilio-debug','/monitor/resilience','/monitor/deploy-matrix'])assert.ok(main.includes('app.get("'+route+'", monitorRateLimit, requireAdmin,'));
});
