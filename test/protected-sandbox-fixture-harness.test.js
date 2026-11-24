'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {plan,imagePin}=require('../scripts/protected-sandbox/fixtureHarness');
test('fixed probe requires immutable image and rejects argument injection',()=>{
 for(const image of ['node:22','node','--privileged','node@sha256:'+'g'.repeat(64),null])assert.throws(()=>plan(image));
});
test('fixed probe uses bounded non-root isolated container without host mounts',()=>{
 const image=imagePin;
 const args=plan(image);
 for(const flag of ['--platform=linux/amd64','--pull=never','--network=none','--read-only','--user=65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=32','--memory=128m','--memory-swap=128m','--cpus=0.5'])assert.ok(args.includes(flag));
 assert.ok(!args.some(a=>/^(--privileged|--volume|--mount|-v|--env|-e=)/.test(a)));
 assert.equal(args.at(-3),image);
});
