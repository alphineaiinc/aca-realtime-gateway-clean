'use strict';
// Draft harness: fixed benign probe only. No candidate code, mounts or credentials.
const {spawnSync}=require('node:child_process');
const {createHash,randomUUID}=require('node:crypto');
const probe="const fs=require('node:fs');if(process.getuid()===0)process.exit(2);try{fs.writeFileSync('/probe-write','x');process.exit(3)}catch(e){if(!['EROFS','EACCES'].includes(e.code))process.exit(4)};if(fs.existsSync('/var/run/docker.sock'))process.exit(5);const status=fs.readFileSync('/proc/self/status','utf8');if(!/^CapEff:\\s*0+$/m.test(status)||!/^NoNewPrivs:\\s*1$/m.test(status)||!/^Seccomp:\\s*2$/m.test(status))process.exit(6);if(Object.keys(require('node:os').networkInterfaces()).some(n=>n!=='lo'))process.exit(7);fs.writeFileSync('/tmp/probe','ok');process.stdout.write('fixture-ok')";
function plan(image){
 if(typeof image!=='string'||!/^node@sha256:[a-f0-9]{64}$/.test(image))throw Error('Pinned node image required');
 return ['run','--rm','--pull=never','--network=none','--read-only','--user=65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=32','--memory=128m','--memory-swap=128m','--cpus=0.5','--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=8m','--entrypoint=node',image,'-e',probe];
}
function run(image){
 const name='alphine-fixture-'+randomUUID();
 const args=plan(image); args.splice(1,0,'--name',name);
 const options={encoding:'utf8',timeout:15000,maxBuffer:8192,env:{PATH:'/usr/bin:/bin',HOME:'/nonexistent',DOCKER_HOST:'unix:///var/run/docker.sock'}};
 const result=spawnSync('/usr/bin/docker',args,options);
 if(result.error||result.signal||result.status!==0||result.stdout!=='fixture-ok'||result.stderr!==''){
  // Best-effort cleanup; a failed or timed-out run never yields acceptance.
  spawnSync('/usr/bin/docker',['rm','-f',name],{...options,timeout:5000});
  throw Error('Fixture outcome denied; reconcile container state');
 }
 return Object.freeze({fixturePassed:true,probeSha256:createHash('sha256').update(probe).digest('hex'),image,executionAuthorized:false,attestation:false});
}
module.exports={plan,run};
