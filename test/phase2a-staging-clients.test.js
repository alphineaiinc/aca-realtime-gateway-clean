"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createPhase2aClients}=require("../src/automation/phase2aStagingClients");
const token="test-github-read-token-not-a-real-secret-12345";
const url="postgresql://aca_p2_reader_a:staging-fixture@ep-demo-pooler.us-east-1.aws.neon.tech/staging";
function fixture(){
 const env={ACA_PHASE2A_ENABLED:"true",ACA_PHASE2A_GITHUB_READ_TOKEN:token,
 ACA_PHASE2A_DATABASE_URL:url,ACA_PHASE2A_LEDGER_ROLE:"aca_p2_reader_a",
 ACA_REVIEW_REPOSITORY:"alphineaiinc/aca-realtime-gateway-clean",
 ACA_REVIEW_REPOSITORY_ID:"1080201236"};
 const requests=[];const configurations=[];
 class FakePool{constructor(config){configurations.push(config);this.closed=false;}
 async connect(){throw Error("no live db in unit test");}
 async end(){this.closed=true;}}
 const fetchImpl=async(uri,options)=>{
  requests.push({uri,options});
  return {ok:true,json:async()=>uri.endsWith("/graphql")?
   {data:{repository:{pullRequest:{number:27}}}}:{id:1080201236}};
 };
 const clients=createPhase2aClients(env,{fetchImpl,PoolClass:FakePool});
 return {env,requests,configurations,clients};
}
test("disabled or missing credentials create no GitHub or DB clients",()=>{
 const x=fixture();assert.ok(x.clients);
 assert.equal(createPhase2aClients({...x.env,ACA_PHASE2A_ENABLED:"false"}),null);
 assert.equal(createPhase2aClients({...x.env,ACA_PHASE2A_GITHUB_READ_TOKEN:""}),null);
 assert.equal(createPhase2aClients({...x.env,ACA_PHASE2A_DATABASE_URL:""}),null);
 assert.equal(createPhase2aClients({...x.env,ACA_PHASE2A_DATABASE_URL:"postgresql://u:p@evil.example/db"}),null);
 assert.equal(createPhase2aClients({...x.env,ACA_REVIEW_REPOSITORY:"someone/else/third"}),null);
});
test("staging pg client uses TLS verification and narrow resource limits",()=>{
 const x=fixture(),settings=x.configurations[0];
 assert.equal(settings.host,"ep-demo-pooler.us-east-1.aws.neon.tech");
 assert.equal(settings.ssl.rejectUnauthorized,true);
 assert.equal(settings.user,"aca_p2_reader_a");
 assert.equal(settings.max,2);
 assert.equal(x.requests.length,0);
});
test("GitHub REST URLs are pinned to exact repository and valid IDs",async()=>{
 const x=fixture(),github=x.clients.github;
 await github.rest.actions.getWorkflowRun({owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",run_id:100});
 await github.rest.repos.listPullRequestsAssociatedWithCommit({owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",commit_sha:"a".repeat(40),per_page:2});
 assert.equal(x.requests.length,2);
 assert.ok(x.requests[0].uri.endsWith("/actions/runs/100"));
 assert.ok(x.requests[1].uri.endsWith("/commits/"+"a".repeat(40)+"/pulls?per_page=2"));
 assert.equal(x.requests[0].options.redirect,"error");
 assert.equal(x.requests[0].options.headers.Authorization,"Bearer "+token);
 await assert.rejects(github.rest.actions.getWorkflowRun({owner:"other",repo:"aca-realtime-gateway-clean",run_id:1}),/scope_mismatch/);
 await assert.rejects(github.rest.pulls.get({owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",pull_number:"../secrets"}),/invalid_pr/);
 assert.equal(x.requests.length,2);
});
test("GitHub GraphQL fails closed on foreign repository and errors",async()=>{
 const x=fixture(),g=x.clients.github;
 const variables={owner:"alphineaiinc",repo:"aca-realtime-gateway-clean",pr:27};
 const data=await g.graphql("query($pr:Int!){repository{pullRequest(number:$pr){number}}}",variables);
 assert.equal(data.repository.pullRequest.number,27);
 await assert.rejects(g.graphql("query{}",{...variables,owner:"bad"}),/invalid_graphql_scope/);
});
