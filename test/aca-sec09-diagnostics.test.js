'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const router = require('../src/routes/envTest');
test('diagnostic requests are limited before JWT verification', async () => {
 const app = express();
 app.use(router);
 const server = app.listen(0, '127.0.0.1');
 try {
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const url = 'http://127.0.0.1:' + server.address().port + '/env';
  for(let i=0;i<30;i++){const r=await fetch(url);assert.equal(r.status,401);await r.text();}
  const r=await fetch(url);assert.equal(r.status,429);assert.ok(r.headers.get('retry-after'));await r.text();
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
