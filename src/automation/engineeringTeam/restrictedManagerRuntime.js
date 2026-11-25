'use strict';
const {createArtifactDownloader}=require('./githubArtifactDownloader');
const {createRestrictedManager}=require('./restrictedManager');
const {createGitHubReadTransport}=require('./githubReadTransport');
// A separate composition root. No mutable queue, worker, database writer,
// scheduler, provider, credential issuer or publication client is constructed.
function createRestrictedManagerRuntime({scope,issue,githubToken,fetchImpl,readOnlyPool,pushEvidence=false,artifactHost}={}){
 const pinned=Object.freeze({...scope});
 const transport=createGitHubReadTransport({token:githubToken,repository:pinned.repository,fetchImpl,downloadArtifact:artifactHost===undefined?undefined:createArtifactDownloader({repository:pinned.repository,token:githubToken,fetchImpl,artifactHost})});
 const observationTransport=pushEvidence?{readIssueStatus:transport.readIssueStatus,readCI:async s=>{const e=await transport.discoverPushEvidence(s);const d=JSON.parse(e.text);return {...e,text:JSON.stringify({runs:d.runs,total:d.runs.length})};}}:transport;
 if(readOnlyPool!==undefined&&typeof readOnlyPool?.query!=='function')throw Error('Read-only pool required');
 const readAlertSummary=readOnlyPool===undefined?undefined:async s=>{
  if(s.product!==pinned.product||s.repository!==pinned.repository||s.sha!==pinned.sha)throw Error('Alert scope denied');
  const result=await readOnlyPool.query('SELECT count(*)::int AS pending FROM (SELECT a.id FROM engineering_team_governance_alerts a WHERE a.product=$1 AND a.repository=$2 AND NOT EXISTS (SELECT 1 FROM engineering_team_governance_acknowledgements k WHERE k.alert_id=a.id) LIMIT 101) AS pending_alerts',[pinned.product,pinned.repository]);
  const n=result.rows?.[0]?.pending;
  if(!Number.isSafeInteger(n)||n<0||n>101)throw Error('Alert count denied');
  return Object.freeze({...pinned,pending:Math.min(n,100),partial:n>100});
 };
 return createRestrictedManager({scope:pinned,issue,transport:observationTransport,readAlertSummary});
}
module.exports={createRestrictedManagerRuntime};
