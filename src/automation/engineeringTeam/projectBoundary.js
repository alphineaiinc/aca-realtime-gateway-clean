'use strict';
const {digest}=require('./patchPlanner');
// LL-SCOPE-001 / OLR-012. Trusted host policy, not model or issue text.
// This disabled composition admits only Development Automation preparation.
// It does not grant execution, publication, or cross-project transfer authority.
const PROJECT='development-automation';
const REPOSITORY='alphineaiinc/aca-realtime-gateway-clean';
const validPath=p=>typeof p==='string'&&/^(src\/automation\/engineeringTeam\/[A-Za-z0-9_-]+|test\/eight-agent-[A-Za-z0-9_-]+)\.js$/.test(p);
const validBranch=b=>typeof b==='string'&&/^automation\/stage3-[a-z0-9-]{1,80}$/.test(b);
const validTask=t=>t==='S3-01'||t==='S3-04'||t==='S3-07';
function createProjectBoundary({manifest,authority,readQueueState}={}){
 const scope=manifest?.scope;
 if(!scope||scope.product!==PROJECT||scope.repository!==REPOSITORY||
    manifest.executionAuthorized!==false||!Array.isArray(manifest.paths)||!manifest.paths.length||
    !manifest.paths.every(validPath)||typeof readQueueState!=='function'||
    authority?.project!==PROJECT||authority.repository!==REPOSITORY||
    authority.sourceSha!==scope.sha||authority.issue!==manifest.issue||
    !validTask(authority.taskId)||!validBranch(authority.branch)||
    authority.purpose!=='automation-preparation'||authority.authorization!=='owner-approved-preparation'||
    authority.transferRequested!==false||!Array.isArray(authority.paths)||
    JSON.stringify(authority.paths)!==JSON.stringify(manifest.paths))throw Error('Project boundary denied');
 const pinned=Object.freeze({project:PROJECT,repository:REPOSITORY,sourceSha:scope.sha,
  issue:manifest.issue,taskId:authority.taskId,branch:authority.branch,
  purpose:'automation-preparation',authorization:'owner-approved-preparation',
  transferRequested:false,paths:Object.freeze([...manifest.paths])});
 const boundaryDigest=digest(JSON.stringify(pinned));
 return async function readBoundState(request){
  if(request?.scope?.product!==PROJECT||request.scope.repository!==REPOSITORY||
     request.scope.sha!==pinned.sourceSha||request.issueNumber!==pinned.issue)throw Error('Project boundary denied');
  const state=await readQueueState(Object.freeze({...request,projectBoundary:pinned,boundaryDigest}));
  const observed=state?.projectBoundary;
  if(!observed||Object.keys(pinned).some(k=>!Object.hasOwn(observed,k)||
    (k==='paths'?JSON.stringify(observed[k])!==JSON.stringify(pinned[k]):observed[k]!==pinned[k]))||
    state.boundaryDigest!==boundaryDigest)throw Error('Project boundary evidence denied');
  return state;
 };
}
module.exports={createProjectBoundary};
