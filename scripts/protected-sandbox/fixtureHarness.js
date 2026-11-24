'use strict';
// Draft harness: fixed benign probe only. No candidate code, mounts or credentials.
const {spawnSync}=require('node:child_process');
const {createHash,randomUUID}=require('node:crypto');
const imagePin='node@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb';
const probe="const fs=require('node:fs');if(!fs.readFileSync('/proc/self/mountinfo','utf8').split('\\n').some(l=>{const a=l.split(' ');return a[4]==='/'&&a[5].split(',').includes('ro')}))process.exit(8);if(process.getuid()!==65534)process.exit(2);try{fs.writeFileSync('/probe-write','x');process.exit(3)}catch(e){if(!['EROFS','EACCES'].includes(e.code))process.exit(4)};if(fs.existsSync('/var/run/docker.sock'))process.exit(5);const status=fs.readFileSync('/proc/self/status','utf8');if(!/^CapEff:\\s*0+$/m.test(status)||!/^NoNewPrivs:\\s*1$/m.test(status)||!/^Seccomp:\\s*2$/m.test(status))process.exit(6);if(Object.keys(require('node:os').networkInterfaces()).some(n=>n!=='lo'))process.exit(7);fs.writeFileSync('/tmp/probe','ok');process.stdout.write('fixture-ok')";
function plan(image){
 if(image!==imagePin)throw Error('Reviewed pinned image required');
 return ['create','--platform=linux/amd64','--pull=never','--network=none','--read-only','--user=65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=32','--memory=128m','--memory-swap=128m','--cpus=0.5','--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=8m','--entrypoint=node',image,'-e',probe];
}
function execute(image,mode){
 const args=plan(image);
 if(mode==='timeout')args[args.length-1]='setTimeout(()=>{},60000)';
 if(require('node:os').platform()!=='linux'||require('node:os').arch()!=='x64')throw Error('Reviewed runner platform required');
 const name='alphine-fixture-'+randomUUID();
 args.splice(1,0,'--name',name);
 const call=(args,timeout=5000)=>spawnSync('/usr/bin/docker',args,{encoding:'utf8',timeout,maxBuffer:8192,env:{PATH:'/usr/bin:/bin',HOME:'/nonexistent',DOCKER_HOST:'unix:///var/run/docker.sock'}});
 const ok=r=>!r.error&&!r.signal&&r.status===0&&r.stderr==='';
 const created=call(args,15000);
 if(!ok(created)||!/^[a-f0-9]{64}\n?$/.test(created.stdout))throw Error('Create unresolved; reconcile '+name);
 const id=created.stdout.trim();
 let passed=false;
 try{
  const config=call(['inspect','--format','{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}}',id]);
  if(!ok(config)||config.stdout.trim()!=='true 134217728 134217728 500000000 32')throw Error('Configuration denied');
  const result=call(['start','-a',id],mode==='timeout'?2000:15000);
  if(mode==='timeout'&&result.error?.code==='ETIMEDOUT')throw Error('Fixed timeout observed');
  if(!ok(result)||result.stdout!=='fixture-ok')throw Error('Fixture outcome denied');
  const state=call(['inspect','--format','{{.State.Status}} {{.State.ExitCode}}',id]);
  if(!ok(state)||state.stdout.trim()!=='exited 0')throw Error('Fixture state denied');
  passed=true;
 }finally{
  const removed=call(['rm','-f',id]);
  const absent=call(mode==='query-failure'?['ps','--invalid-fixed-fixture-option']:['ps','-aq','--no-trunc','--filter','id='+id]);
  if(!ok(removed)||!ok(absent)||absent.stdout!=='')throw Error('Cleanup unresolved; reconcile '+id);
 }
 if(!passed)throw Error('Fixture outcome denied');
 return Object.freeze({fixturePassed:true,probeSha256:createHash('sha256').update(probe).digest('hex'),image,executionAuthorized:false,attestation:false});
}
function run(image){return execute(image,'normal');}
function runTimeoutFixture(){return execute(imagePin,'timeout');}
function runFailedQueryFixture(){return execute(imagePin,'query-failure');}
module.exports={plan,run,imagePin,runTimeoutFixture,runFailedQueryFixture};
