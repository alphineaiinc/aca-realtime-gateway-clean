'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const digest=value=>createHash('sha256').update(value).digest('hex');
// Fixed source, never taken from a candidate branch or model output.
const probe=[
 "const assert=require('node:assert/strict');",
 "const fs=require('node:fs');",
 "const os=require('node:os');",
 "assert.notEqual(process.getuid(),0);",
 "assert.ok(Object.values(os.networkInterfaces()).flat().every(x=>x.internal));",
 "for(const k of ['GITHUB_TOKEN','OPENAI_API_KEY','DATABASE_URL','AWS_ACCESS_KEY_ID'])assert.equal(process.env[k],undefined);",
 "assert.throws(()=>fs.writeFileSync('/probe-write','blocked'));",
 "assert.throws(()=>fs.accessSync('/var/run/docker.sock'));",
 "const s=fs.readFileSync('/proc/self/status','utf8');",
 "assert.match(s,/^NoNewPrivs:\\s+1$/m);",
 "assert.match(s,/^CapEff:\\s+0+$/m);",
 "assert.match(s,/^Seccomp:\\s+2$/m);",
 "assert.equal(2+3,5);",
 "process.stdout.write('fixed-fixture-passed');"
].join('\n');
// Draft harness: only an operator-supplied digest-pinned local Node image.
// No pull, mounts, arbitrary command, candidate input, or execution grant.
function createFixedSandboxHarness({image,harnessSha,execute=spawnSync}={}){
 if(typeof image!=='string'||!/^node@sha256:[a-f0-9]{64}$/.test(image)||typeof harnessSha!=='string'||!/^[a-f0-9]{40}$/.test(harnessSha)||typeof execute!=='function')throw Error('Invalid harness configuration');
 const evidence=Object.freeze({harnessSha,image,fixtureSha256:digest(probe)});
 let used=false;
 const host=['--host','unix:///var/run/docker.sock'];
 const options=Object.freeze({encoding:'utf8',timeout:30000,maxBuffer:65536,env:Object.freeze({PATH:'/usr/bin:/bin',HOME:'/nonexistent'}),shell:false});
 return Object.freeze({async run(){
  if(used)throw Error('Harness consumed');
  used=true;
  const name='aca-fixture-'+randomUUID();
  const args=[...host,'run','--name',name,'--pull=never','--network=none','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m','--user','65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges','--memory=128m','--memory-swap=128m','--cpus=0.5','--pids-limit=32','--ulimit','nofile=128:128','--entrypoint','node',image,'-e',probe];
  let result,cleanup;
  try{result=execute('/usr/bin/docker',args,options);}
  catch{result=null;}
  finally{
   try{cleanup=execute('/usr/bin/docker',[...host,'rm','-f',name],options);}
   catch{cleanup=null;}
  }
  const passed=result?.status===0&&!result.error&&!result.signal&&result.stdout==='fixed-fixture-passed'&&cleanup?.status===0&&!cleanup.error&&!cleanup.signal;
  return Object.freeze({...evidence,status:passed?'passed':'denied',provenance:'unreviewed-fixed-fixture-harness',executionAuthorized:false});
 }});
}
module.exports={createFixedSandboxHarness};
