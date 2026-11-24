'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPatchPlanner,digest}=require('../src/automation/engineeringTeam/patchPlanner');
const {createGitHubBranchTransport}=require('../src/automation/engineeringTeam/githubBranchTransport');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const files=[{path:'src/example.js',text:'module.exports=1;',role:'backend-developer'}];
const plan=createPatchPlanner({scope,files}).plan({role:'backend-developer',edits:[{path:files[0].path,beforeSha256:digest(files[0].text),replacement:'module.exports=2;'}]});
const [rootTree,subtree,blobSha,newTree,newCommit]=['b','c','d','e','f'].map(c=>c.repeat(40));
function fixture({allow=true,symlink=false,stale=false,changed=false,fail=false}={}){
 const calls=[];let bases=0;
 const transport=createGitHubBranchTransport({token:'fixture',scope,admit:async()=>allow,fetchImpl:async(url,options)=>{
  const path=url.replace('https://api.github.com/repos/fixture/aca','');
  const method=options.method;const body=options.body?JSON.parse(options.body):null;
  calls.push({path,method,body});assert.equal(options.redirect,'error');
  let value;
  if(path==='/git/ref/heads/main')value={object:{sha:(stale||(changed&&++bases>1))?newCommit:scope.sha}};
  else if(path==='/git/commits/'+scope.sha)value={sha:scope.sha,tree:{sha:rootTree}};
  else if(path==='/git/trees/'+rootTree)value={sha:rootTree,truncated:false,tree:[{path:'src',mode:'040000',type:'tree',sha:subtree}]};
  else if(path==='/git/trees/'+subtree)value={sha:subtree,truncated:false,tree:[{path:'example.js',mode:symlink?'120000':'100644',type:'blob',sha:blobSha}]};
  else if(path==='/git/blobs/'+blobSha)value={sha:blobSha,encoding:'base64',size:Buffer.byteLength(files[0].text),content:Buffer.from(files[0].text).toString('base64')};
  else if(path==='/git/trees'&&method==='POST'){assert.equal(body.base_tree,rootTree);assert.equal(body.tree[0].content,'module.exports=2;');value={sha:newTree};}
  else if(path==='/git/commits'&&method==='POST'){assert.deepEqual(body.parents,[scope.sha]);value={sha:newCommit,tree:{sha:newTree},parents:[{sha:scope.sha}]};}
  else if(path==='/git/refs'&&method==='POST'){if(fail)throw Error('timeout');assert.match(body.ref,/^refs\/heads\/aca-agent-draft-[a-f0-9]{16}$/);value={ref:body.ref,object:{sha:newCommit}};}
  else assert.fail('Unexpected endpoint');
  return new Response(JSON.stringify(value));
 }});
 return {transport,calls};
}
test('creates a new draft ref only after verified source and admission',async()=>{
 const f=fixture();const result=await f.transport.create({files,plan});
 assert.equal(result.headSha,newCommit);assert.equal(result.releaseApproved,false);
 assert.deepEqual(f.calls.filter(c=>c.method!=='GET').map(c=>c.path),['/git/trees','/git/commits','/git/refs']);
});
test('stale base, symlink and denied admission never write',async()=>{
 for(const options of [{stale:true},{symlink:true},{allow:false}]){
  const f=fixture(options);await assert.rejects(f.transport.create({files,plan}));assert.equal(f.calls.some(c=>c.method!=='GET'),false);
 }
});
test('changed base prevents ref creation and ambiguous mutation is not retried',async()=>{
 const f=fixture({changed:true});await assert.rejects(f.transport.create({files,plan}),/reconcile/);assert.equal(f.calls.some(c=>c.path==='/git/refs'),false);
 const g=fixture({fail:true});await assert.rejects(g.transport.create({files,plan}),/reconcile/);assert.equal(g.calls.filter(c=>c.path==='/git/refs').length,1);
});
