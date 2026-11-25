const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'../src/routes',n+'.js'),'utf8');
test('diagnostic ingress precedes authorization and distributed admission',()=>{assert.match(read('envTest'),/router\.get\("\/env", envIngress, authenticateAdmin, envLimit/);assert.match(read('dashboard'),/router\.get\("\/data", dashboardIngress, requireVerifiedOperator, dashboardLimit/);assert.match(read('dashboard'),/router\.get\("\/brain-status", dashboardIngress, requireVerifiedOperator, dashboardLimit/);});
test('signup admission precedes database work',()=>{assert.match(read('public'),/router\.post\("\/public\/signup", signupIngress, signupDistributed, async/);assert.match(read('public'),/scope:"public-signup",max:60,publicGlobal:true/);});
