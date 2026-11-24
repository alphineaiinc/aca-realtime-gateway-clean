const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
test('billing mutations fail closed and invalid tenant claims are rejected', async t => {
  process.env.JWT_SECRET = 'disposable-test-only-secret';
  const poolPath = require.resolve('../src/db/pool');
  require.cache[poolPath] = {id:poolPath,filename:poolPath,loaded:true,exports:{query:async()=>assert.fail('unexpected database access')}};
  const app = express();
  app.use(express.json());
  app.use('/billing', require('../src/routes/billing'));
  const server = app.listen(0,'127.0.0.1');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await new Promise(resolve=>server.once('listening',resolve));
  const base = 'http://127.0.0.1:'+server.address().port+'/billing';
  const token = jwt.sign({tenant_id:1},process.env.JWT_SECRET);
  for(const [path,error] of [['/generate','verified_usage_required'],['/pay','verified_settlement_required'],['/email/1','verified_delivery_required']]){
    const response = await fetch(base+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'});
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{ok:false,error});
  }
  for(const claims of [{partner_id:1},{tenant_id:-1},{tenant_id:'../other'}]){
    const response=await fetch(base+'/history',{headers:{authorization:'Bearer '+jwt.sign(claims,process.env.JWT_SECRET)}});
    assert.equal(response.status,403);
  }
  assert.equal((await fetch(base+'/history')).status,401);
});
