'use strict';
// Trusted host configuration only. Fixed HTTPS origin; no model-supplied URL.
function createGitHubReadTransport({token,repository,fetchImpl=globalThis.fetch,timeoutMs=10000,downloadArtifact}={}){
 if(typeof token!=='string'||!token||/[\r\n]/.test(token)||typeof repository!=='string'||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||repository.split('/').some(p=>p==='.'||p==='..')||typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw Error('Invalid GitHub configuration');
 const pinnedRepository=repository;
 function base(s){if(!s||s.repository!==pinnedRepository||! /^[a-f0-9]{40}$/.test(s.sha))throw Error('Repository scope denied');return 'https://api.github.com/repos/'+pinnedRepository;}
 async function get(url){
  try{
   const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
   if(!response.ok||!response.body)throw Error('Read failed');
   const reader=response.body.getReader();let total=0;const chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>262144)throw Error('Response limit');chunks.push(Buffer.from(value));}}
   finally{await reader.cancel().catch(()=>{});}
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{throw Error('GitHub read failed');}
 }
 function bounded(text){if(typeof text!=='string'||text.length>16000)throw Error('Evidence size denied');return text;}
 return Object.freeze({
  async readSource(s){
   const root=base(s);
   if(typeof s.path!=='string'||s.path.length>240||!s.path.split('/').every(p=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p)))throw Error('Invalid path');
   const data=await get(root+'/contents/'+s.path.split('/').map(encodeURIComponent).join('/')+'?ref='+s.sha);
   if(data.type!=='file'||data.path!==s.path||data.encoding!=='base64'||typeof data.content!=='string'||!Number.isSafeInteger(data.size)||data.size<0||data.size>16000||data.target||data.submodule_git_url)throw Error('Source evidence denied');
   const bytes=Buffer.from(data.content,'base64');
   if(bytes.length!==data.size)throw Error('Source size mismatch');
   return Object.freeze({repository:s.repository,sha:s.sha,path:s.path,text:bounded(new TextDecoder('utf-8',{fatal:true}).decode(bytes))});
  },
  async readIssue(s){
   const root=base(s);if(!Number.isSafeInteger(s.issue)||s.issue<1)throw Error('Invalid issue');
   const data=await get(root+'/issues/'+s.issue);
   if(data.number!==s.issue||data.pull_request||typeof data.title!=='string')throw Error('Issue evidence denied');
   return Object.freeze({repository:s.repository,issue:s.issue,text:bounded(data.title+'\n'+(data.body??''))});
  },
  async readIssueStatus(s){
   const root=base(s);if(!Number.isSafeInteger(s.issue)||s.issue<1)throw Error('Invalid issue');
   const data=await get(root+'/issues/'+s.issue);
   if(data.number!==s.issue||data.pull_request||!['open','closed'].includes(data.state)||!Array.isArray(data.labels)||data.labels.length>100||data.labels.some(l=>typeof l?.name!=='string'||l.name.length>100))throw Error('Issue status denied');
   return Object.freeze({repository:s.repository,issue:s.issue,state:data.state,labels:Object.freeze(data.labels.map(l=>l.name))});
  },
  async discoverPushEvidence(s){
   const root=base(s); const runs=[]; const seen=new Set();
   for(let page=1;page<=5;page++){
    const data=await get(root+"/actions/runs?head_sha="+s.sha+"&event=push&per_page=20&page="+page);
    if(!Array.isArray(data.workflow_runs)||data.workflow_runs.length>20||!Number.isSafeInteger(data.total_count)||data.total_count<0||data.total_count>100)throw Error("CI inventory denied");
    for(const x of data.workflow_runs){if(x.head_sha!==s.sha||x.event!=="push"||!Number.isSafeInteger(x.id)||x.id<1||seen.has(x.id))throw Error("CI provenance denied");seen.add(x.id);runs.push({id:x.id,name:x.name,status:x.status,conclusion:x.conclusion,head_sha:x.head_sha});}
    if(runs.length===data.total_count)break;
    if(data.workflow_runs.length!==20||page===5)throw Error("Incomplete CI inventory");
   }
   return Object.freeze({repository:s.repository,sha:s.sha,text:bounded(JSON.stringify({runs,event:"push"}))});
  },
  async readPushArtifacts(s,runId){
   const root=base(s);if(!Number.isSafeInteger(runId)||runId<1)throw Error("Invalid run");
   const run=await get(root+"/actions/runs/"+runId);
   if(run.id!==runId||run.head_sha!==s.sha||run.event!=="push"||run.status!=="completed"||run.conclusion!=="success")throw Error("Run provenance denied");
   const data=await get(root+"/actions/runs/"+runId+"/artifacts?per_page=20");
   if(!Array.isArray(data.artifacts)||data.total_count!==data.artifacts.length||data.artifacts.length>20)throw Error("Incomplete artifact inventory");
   const artifacts=data.artifacts.map(a=>{if(a.expired!==false||a.workflow_run?.id!==runId||a.workflow_run?.head_sha!==s.sha||!Number.isSafeInteger(a.id)||a.id<1||!/^sha256:[a-f0-9]{64}$/.test(a.digest))throw Error("Artifact provenance denied");return {id:a.id,name:a.name,digest:a.digest,size:a.size_in_bytes};});
   return Object.freeze({repository:s.repository,sha:s.sha,text:bounded(JSON.stringify({runId,artifacts}))});
  },
  async readVerifiedPushArtifact(s,runId,artifactId){
   base(s);
   if(typeof downloadArtifact!=='function'||!Number.isSafeInteger(artifactId)||artifactId<1)throw Error('Artifact downloader unavailable');
   const inventory=JSON.parse((await this.readPushArtifacts(s,runId)).text);
   const matches=inventory.artifacts.filter(a=>a.id===artifactId);
   if(matches.length!==1)throw Error('Artifact selection denied');
   const a=matches[0];
   if(!Number.isSafeInteger(a.size)||a.size<1||a.size>8388608)throw Error('Artifact size denied');
   const bytes=await downloadArtifact(Object.freeze({repository:pinnedRepository,sha:s.sha,runId,artifactId,maxBytes:a.size}));
   if(!Buffer.isBuffer(bytes)||bytes.length!==a.size||'sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==a.digest)throw Error('Artifact integrity denied');
   return Object.freeze({repository:pinnedRepository,sha:s.sha,runId,artifactId,digest:a.digest,bytes:Buffer.from(bytes)});
  },
  async readCI(s){
   const data=await get(base(s)+'/actions/runs?head_sha='+s.sha+'&per_page=20');
   if(!Array.isArray(data.workflow_runs)||data.workflow_runs.some(x=>x.head_sha!==s.sha))throw Error('CI revision denied');
   const runs=data.workflow_runs.map(x=>({id:x.id,name:x.name,status:x.status,conclusion:x.conclusion,head_sha:x.head_sha}));
   return Object.freeze({repository:s.repository,sha:s.sha,text:bounded(JSON.stringify({runs,total:data.total_count,limited:true}))});
  }
 });
}
module.exports={createGitHubReadTransport};
