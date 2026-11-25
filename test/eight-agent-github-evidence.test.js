'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createGitHubEvidenceBroker}=require('../src/automation/engineeringTeam/githubEvidenceBroker');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
function fixture(overrides={}){
 let calls=0;
 const broker=createGitHubEvidenceBroker({scopes:[{...scope,issue:42,paths:['src/example.js']}],authorize:async()=>true,
 readSource:async s=>{calls++;return {...s,text:'fixture source'};},
 readIssue:async s=>{calls++;return {...s,text:'fixture issue'};},
 readCI:async s=>{calls++;return {...s,text:'fixture CI'};},...overrides});
 return {broker,calls:()=>calls};
}
const bind=(broker,role='qa-testing',task=scope)=>broker.bind({task,role,sha:scope.sha,isActive:()=>true,onDecision:()=>{}});
test('pinned source and CI, mutable issue provenance, exact path inventory',async()=>{
 const {broker,calls}=fixture();const session=bind(broker);
 assert.equal((await session.read({action:'source.read',path:'src/example.js'})).sha,scope.sha);
 assert.equal((await session.read({action:'ci.read'})).sha,scope.sha);
 assert.equal((await session.read({action:'issue.read'})).sha,null);
 await assert.rejects(session.read({action:'source.read',path:'src/other.js'}));
 await assert.rejects(session.read({action:'source.write',path:'src/example.js'}));
 assert.equal(calls(),3);
});
test('scope, role and authorization deny before transport',async()=>{
 const {broker,calls}=fixture();
 await assert.rejects(bind(broker,'project-manager').read({action:'ci.read'}));
 await assert.rejects(bind(broker,'qa-testing',{...scope,repository:'other/repo'}).read({action:'ci.read'}));
 await assert.rejects(bind(broker).read({action:'ci.read',repository:'other/repo'}));
 assert.equal(calls(),0);
 const denied=fixture({authorize:async()=>false});
 await assert.rejects(bind(denied.broker).read({action:'ci.read'}));assert.equal(denied.calls(),0);
});
test('wrong evidence revision and revoked session reject results',async()=>{
 const {broker}=fixture({readCI:async s=>({...s,sha:'b'.repeat(40),text:'fixture'})});
 await assert.rejects(bind(broker).read({action:'ci.read'}));
 const f=fixture();const session=bind(f.broker);session.close();
 await assert.rejects(session.read({action:'ci.read'}));assert.equal(f.calls(),0);
});
