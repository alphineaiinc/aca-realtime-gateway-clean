'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../src/routes',name),'utf8');
test('additional expensive routes enforce quotas after authorization',()=>{
 for(const [file,expected] of [
 ['partnerLegal.js',['downloadLimit, async','authenticate, routeLimit, async']],
 ['partnerPayout.js',['authenticate, requireAdmin, routeLimit, async','authenticate, routeLimit, async']],
 ['voiceProfile.js',['router.post("/tenant/voice-profile", verifyToken, routeLimit, async','router.get("/tenant/voice-profile", verifyToken, routeLimit, async']]
 ]) for(const value of expected) assert.ok(read(file).includes(value),file+': '+value);
});
test('tenant ID alone cannot mint credentials and provisioning uses dedicated transaction client',()=>{
 const source=read('tenant.js');
 const login=source.slice(source.indexOf('router.post("/login"'),source.indexOf('router.get("/profile"'));
 assert.ok(login.includes('status(403)'));
 assert.ok(!login.includes('jwt.sign'));
 for(const value of ['client = await pool.connect()', 'client.query("BEGIN")','insertTenantDynamic(client, req.body || {})','insertBusiness(client, tenantId','ensureDefaultEmbeddingSpace(client, tenantId)','client.query("COMMIT")','client.query("ROLLBACK")','client.release()']) assert.ok(source.includes(value),value);
});

test('chat and voice routes enforce shared quotas and explicit tenant boundaries',()=>{
 for(const [file,count] of [['chat.js',1],['chat_stream.js',2],['voice.js',3]]){
 const routes=read(file).split('\n').filter(line=>/router\.(get|post)\(/.test(line));
 assert.equal(routes.length,count);
 for(const route of routes)assert.ok(route.includes('authenticate, sharedLimit,'),route);
 }
 assert.ok(!read('chat.js').includes('cfg.tenantId || decoded.tenant_id'));
 assert.ok(!read('chat_stream.js').includes('forcedTenant || decoded.tenant_id'));
 assert.ok(read('voice.js').includes('trimmedText.length > 2000'));
});
