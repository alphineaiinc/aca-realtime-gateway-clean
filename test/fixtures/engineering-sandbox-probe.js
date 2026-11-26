'use strict';
// Trusted sandbox probe, not an arbitrary generated-code runner.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
assert.notEqual(process.getuid(),0);
assert.equal(Object.values(os.networkInterfaces()).flat().every(x=>x.internal),true);
assert.equal(process.env.GITHUB_TOKEN,undefined);
assert.equal(process.env.OPENAI_API_KEY,undefined);
assert.equal(process.env.DATABASE_URL,undefined);
assert.throws(()=>fs.writeFileSync('/sandbox-probe','blocked'),e=>['EROFS','EACCES','EPERM'].includes(e.code));
assert.throws(()=>fs.accessSync('/var/run/docker.sock'));
const status=fs.readFileSync('/proc/self/status','utf8');
assert.match(status,/^NoNewPrivs:\s+1$/m);
assert.match(status,/^CapEff:\s+0+$/m);
assert.match(status,/^Seccomp:\s+2$/m);
console.log('Trusted sandbox probe passed: non-root, loopback-only, read-only root, no credentials or socket, no capabilities, seccomp and no-new-privileges.');
