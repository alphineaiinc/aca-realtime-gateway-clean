'use strict';
const {roles}=require('./registry');
const {capabilities}=require('./toolBroker');
const {createGitHubReadTransport}=require('./githubReadTransport');
const {createGitHubEvidenceBroker}=require('./githubEvidenceBroker');
const {createOpenAITransport}=require('./openaiTransport');
const {createModelAdapters}=require('./modelAdapter');
const {createAgentManager}=require('./manager');
const {runOfflineTeam}=require('./offlineTeam');
// Simulation-only composition. No default clients, environment credentials,
// scheduler, writes, or server entrypoint. Injected transports must be fixtures.
function createSimulationRuntime({scope,issue,paths,fetchFixture,modelFixture,budget,authorize}={}){
 if(!scope||typeof fetchFixture!=='function'||typeof modelFixture!=='function'||typeof budget?.reserve!=='function'||typeof authorize!=='function'||!Array.isArray(paths)||paths.length>2||!paths.length||!Number.isSafeInteger(issue)||issue<1)throw Error('Invalid simulation configuration');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 if(typeof pinned.product!=='string'||!pinned.product||typeof pinned.repository!=='string'||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(pinned.repository)||typeof pinned.sha!=='string'||! /^[a-f0-9]{40}$/.test(pinned.sha))throw Error('Invalid simulation scope');
 const read=createGitHubReadTransport({token:'offline-fixture',fetchImpl:fetchFixture});
 const broker=createGitHubEvidenceBroker({scopes:[{...pinned,issue,paths}],...read,authorize});
 const transport=createOpenAITransport({client:{responses:{create:modelFixture}},models:Object.fromEntries(Object.keys(roles).map(r=>[r,'offline-fixture'])),authorize:role=>authorize({scope:pinned,role,action:'provider.simulate'}),budget});
 const evidencePlan=Object.fromEntries(Object.keys(roles).map(role=>[role,capabilities[role].flatMap(action=>action==='source.read'?paths.map(path=>({action,path})):[{action}])]));
 const manager=createAgentManager({scopes:[pinned],broker,adapters:createModelAdapters({generate:transport.generate,evidencePlan})});
 let used=false;
 return Object.freeze({async run(subject){
  if(used)throw Error('Simulation already consumed');
  used=true;
  const task=manager.createTask({...pinned,subject});
  const result=await runOfflineTeam({manager,task});
  return Object.freeze({...result,usage:transport.usage(),audit:manager.audit(),mode:'simulation-only'});
 },stop:manager.stop,quarantine:manager.quarantine});
}
module.exports={createSimulationRuntime};
