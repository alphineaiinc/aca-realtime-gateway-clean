'use strict';
const {prepareBranch}=require('./branchPreparation');
// Unmounted branch transport. Only creates a new ref; never updates existing
// refs, merges, deploys or retries ambiguous mutations. Trusted host must
// supply independent acceptance and durable single-use admission.
function createGitHubBranchTransport({token,scope,baseBranch='main',fetchImpl=globalThis.fetch,admit}={}){
 if(typeof token!=='string'||!token||/[\r\n]/.test(token)||!scope||typeof scope.repository!=='string'||! /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(scope.repository)||! /^[a-f0-9]{40}$/.test(scope.sha)||! /^[A-Za-z0-9_-]+$/.test(baseBranch)||typeof fetchImpl!=='function'||typeof admit!=='function')throw Error('Invalid branch transport');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 const root='https://api.github.com/repos/'+pinned.repository;
 const validSha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
 async function call(path,method,body){
  const res=await fetchImpl(root+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});
  if(!res.ok||!res.body)throw Error('GitHub request failed');
  const reader=res.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw Error('Response limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 return Object.freeze({async create({files,plan}={}){
  const inventory=Object.freeze(files.map(f=>Object.freeze({path:f.path,role:f.role,text:f.text})));
  const spec=prepareBranch({scope:pinned,files:inventory,plan});
  const base=await call('/git/ref/heads/'+baseBranch,'GET');
  if(base.object?.sha!==pinned.sha)throw Error('Stale base');
  const parent=await call('/git/commits/'+pinned.sha,'GET');
  if(parent.sha!==pinned.sha||!validSha(parent.tree?.sha))throw Error('Parent denied');
  // Verify actual Git tree entries, not Contents API symlink dereferences.
  for(const entry of spec.files){
   let treeSha=parent.tree.sha;
   const parts=entry.path.split('/');
   for(let i=0;i<parts.length;i++){
    const tree=await call('/git/trees/'+treeSha,'GET');
    if(tree.sha!==treeSha||tree.truncated!==false||!Array.isArray(tree.tree))throw Error('Tree denied');
    const matches=tree.tree.filter(e=>e.path===parts[i]);
    if(matches.length!==1||!validSha(matches[0].sha))throw Error('Path denied');
    const node=matches[0];
    if(i<parts.length-1){if(node.type!=='tree'||node.mode!=='040000')throw Error('Directory denied');treeSha=node.sha;}
    else{
     if(node.type!=='blob'||node.mode!=='100644')throw Error('File mode denied');
     const blob=await call('/git/blobs/'+node.sha,'GET');
     const old=inventory.find(f=>f.path===entry.path);
     if(blob.sha!==node.sha||blob.encoding!=='base64'||typeof blob.content!=='string'||!Number.isSafeInteger(blob.size)||blob.size<0||blob.size>16000||Buffer.from(blob.content,'base64').compare(Buffer.from(old.text,'utf8'))!==0)throw Error('Source denied');
    }
   }
  }
  if(await admit(Object.freeze({scope:pinned,operation:'branch.create',binding:spec.binding,branch:spec.branch,patchDigest:spec.patchDigest}))!==true)throw Error('Branch admission denied');
  try{
   const tree=await call('/git/trees','POST',{base_tree:parent.tree.sha,tree:spec.files});
   if(!validSha(tree.sha))throw Error('Tree response denied');
   const commit=await call('/git/commits','POST',{message:'Engineering draft '+spec.binding.slice(0,16),tree:tree.sha,parents:[pinned.sha]});
   if(!validSha(commit.sha)||commit.tree?.sha!==tree.sha||commit.parents?.length!==1||commit.parents[0].sha!==pinned.sha)throw Error('Commit response denied');
   const current=await call('/git/ref/heads/'+baseBranch,'GET');
   if(current.object?.sha!==pinned.sha)throw Error('Base changed');
   const ref=await call('/git/refs','POST',{ref:'refs/heads/'+spec.branch,sha:commit.sha});
   if(ref.ref!=='refs/heads/'+spec.branch||ref.object?.sha!==commit.sha)throw Error('Ref response denied');
   return Object.freeze({branch:spec.branch,headSha:commit.sha,binding:spec.binding,releaseApproved:false});
  }catch{throw Error('Branch outcome uncertain; reconcile before any retry');}
 }});
}
module.exports={createGitHubBranchTransport};
