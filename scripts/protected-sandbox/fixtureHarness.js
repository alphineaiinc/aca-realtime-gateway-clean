'use strict';
// Draft harness: fixed benign probe only. No candidate code, mounts or credentials.
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const probe="const fs=require('node:fs');if(process.getuid()===0)process.exit(2);try{fs.writeFileSync('/probe-write','x');process.exit(3)}catch(e){if(!['EROFS','EACCES'].includes(e.code))process.exit(4)};if(fs.existsSync('/var/run/docker.sock'))process.exit(5);fs.writeFileSync('/tmp/probe','ok');process.stdout.write('fixture-ok')";
function plan(image){
 if(typeof image!=='string'||!/^node@sha256:[a-f0-9]{64}$/.test(image))throw Error('Pinned node image required');
 return ['run','--rm','--pull=never','--network=none','--read-only','--user=65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=32','--memory=128m','--memory-swap=128m','--cpus=0.5','--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=8m','--entrypoint=node',image,'-e',probe];
}
function run(image){
 const args=plan(image);
 const result=spawnSync('/usr/bin/docker',args,{encoding:'utf8',timeout:15000,maxBuffer:8192,env:{PATH:'/usr/bin:/bin',HOME:'/nonexistent',DOCKER_HOST:'unix:///var/run/docker.sock'}});
 if(result.error||result.signal||result.status!==0||result.stdout!=='fixture-ok'||result.stderr!=='')throw Error('Fixture outcome denied; reconcile container state');
 return Object.freeze({fixturePassed:true,probeSha256:createHash('sha256').update(probe).digest('hex'),image,executionAuthorized:false,attestation:false});
}
module.exports={plan,run};
