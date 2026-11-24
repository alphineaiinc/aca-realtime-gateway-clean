'use strict';
// Trusted host configuration only. Fixed HTTPS origin; no model-supplied URL.
function createGitHubReadTransport({token,repository,fetchImpl=globalThis.fetch,timeoutMs=10000}={}){
 if(typeof token!=='string'||!token||/[\r\n]/.test(token)||typeof repository!=='string'||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||repository.split('/').some(p=>p==='.'||p==='..')||typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw Error('Invalid GitHub configuration');
 const pinnedRepository=repository;
 function base(s){if(!s||s.repository!==pinnedRepository||! /^[a-f0-9]{40}$/.test(s.sha))throw Error('Repository scope denied');return 'https://api.github.com/repos/'+pinnedRepository;}
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
  async readCI(s){
   const data=await get(base(s)+'/actions/runs?head_sha='+s.sha+'&per_page=20');
   if(!Array.isArray(data.workflow_runs)||data.workflow_runs.some(x=>x.head_sha!==s.sha))throw Error('CI revision denied');
   const runs=data.workflow_runs.map(x=>({id:x.id,name:x.name,status:x.status,conclusion:x.conclusion,head_sha:x.head_sha}));
   return Object.freeze({repository:s.repository,sha:s.sha,text:bounded(JSON.stringify({runs,total:data.total_count,limited:true}))});
  }
 });
}
module.exports={createGitHubReadTransport};
