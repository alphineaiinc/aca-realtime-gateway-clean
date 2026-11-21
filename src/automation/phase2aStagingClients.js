"use strict";
/**
 * Disabled-by-default staging dependency wiring. No database connection or
 * GitHub API request occurs until the authenticated endpoint is invoked.
 * A dedicated read-only token is required; reviewer signing is not involved.
 */
const {Pool}=require("pg");
const positive=n=>Number.isSafeInteger(n)&&n>0;
function createPhase2aClients(env=process.env,{fetchImpl=fetch,PoolClass=Pool}={}){
 if(env.ACA_PHASE2A_ENABLED!=="true")return null;
 const token=env.ACA_PHASE2A_GITHUB_READ_TOKEN;
 const url=env.ACA_PHASE2A_DATABASE_URL;
 if(typeof token!=="string"||token.length<24||
    typeof url!=="string"||typeof env.ACA_PHASE2A_LEDGER_ROLE!=="string"||
    !/^[a-z_][a-z0-9_]{0,62}$/.test(env.ACA_PHASE2A_LEDGER_ROLE))
   return null;
 const repoName=env.ACA_REVIEW_REPOSITORY;
 if(typeof repoName!=="string"||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoName)||
   !positive(Number(env.ACA_REVIEW_REPOSITORY_ID)))return null;
 let db;
 try{db=new URL(url);}catch{return null;}
 if(db.protocol!=="postgresql:"||!db.hostname.endsWith(".neon.tech")||
    !db.username||!db.password||!db.pathname.slice(1)||
    (db.port&&db.port!=="5432"))return null;
 // Pin the actual isolated staging target: a Neon domain suffix alone would
 // also accept a mistakenly supplied production project connection string.
 const expectedHost=env.ACA_PHASE2A_EXPECTED_NEON_HOST;
 const expectedDatabase=env.ACA_PHASE2A_EXPECTED_DATABASE;
 const decodedUser=decodeURIComponent(db.username);
 const decodedDatabase=decodeURIComponent(db.pathname.slice(1));
 if(typeof expectedHost!=="string"||
    !/^([a-z0-9-]+\\.)+[a-z0-9-]+\\.neon\\.tech$/.test(expectedHost)||
    typeof expectedDatabase!=="string"||
    !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(expectedDatabase)||
    db.hostname!==expectedHost||decodedDatabase!==expectedDatabase||
    decodedUser!==env.ACA_PHASE2A_LEDGER_ROLE)
   return null;
 const segments=repoName.split("/");
 const pathPart=encodeURIComponent;
 async function api(resource,{graphqlQuery,variables}={}){
  const address=graphqlQuery?"https://api.github.com/graphql":
    "https://api.github.com/repos/"+segments.map(pathPart).join("/")+resource;
  const response=await fetchImpl(address,{
    method:graphqlQuery?"POST":"GET",
    headers:{Authorization:"Bearer "+token,
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      ...(graphqlQuery?{"Content-Type":"application/json"}:{})},
    ...(graphqlQuery?{body:JSON.stringify({query:graphqlQuery,variables})}:{}),
    redirect:"error",signal:AbortSignal.timeout(7000)
  });
  if(!response?.ok)throw new Error("phase2a_github_unavailable");
  const body=await response.json();
  if(graphqlQuery&&(!body?.data||body.errors?.length))
   throw new Error("phase2a_github_graphql_unavailable");
  return graphqlQuery?body.data:body;
 }
 function ensureRepo(owner,repo){
  if(owner!==segments[0]||repo!==segments[1])
   throw new Error("phase2a_repository_scope_mismatch");
 }
 const github={rest:{
  actions:{getWorkflowRun:async({owner,repo,run_id})=>{
   ensureRepo(owner,repo);if(!positive(run_id))throw Error("invalid_run_id");
   return {data:await api("/actions/runs/"+run_id)};
  }},
  repos:{
   get:async({owner,repo})=>{ensureRepo(owner,repo);return {data:await api("")};},
   listPullRequestsAssociatedWithCommit:async({owner,repo,commit_sha,per_page})=>{
    ensureRepo(owner,repo);
    if(!/^[a-f0-9]{40}$/.test(commit_sha)||per_page!==2)
      throw Error("invalid_commit_association_request");
    return {data:await api("/commits/"+commit_sha+"/pulls?per_page=2")};
   }
  },
  pulls:{get:async({owner,repo,pull_number})=>{
   ensureRepo(owner,repo);if(!positive(pull_number))throw Error("invalid_pr");
   return {data:await api("/pulls/"+pull_number)};
  }},
  issues:{get:async({owner,repo,issue_number})=>{
   ensureRepo(owner,repo);if(!positive(issue_number))throw Error("invalid_issue");
   return {data:await api("/issues/"+issue_number)};
  }}
 },graphql:async(query,variables)=>{
  if(typeof query!=="string"||!variables||
     variables.owner!==segments[0]||variables.repo!==segments[1]||
     !positive(variables.pr))throw Error("invalid_graphql_scope");
  return api("",{graphqlQuery:query,variables});
 }};
 const pool=new PoolClass({
  host:db.hostname,port:Number(db.port||5432),
  user:decodedUser,
  password:decodeURIComponent(db.password),
  database:decodedDatabase,
  ssl:{rejectUnauthorized:true},max:2,
  connectionTimeoutMillis:5000,idleTimeoutMillis:5000,
  application_name:"aca_phase2a_staging_readonly"
 });
 return {github,pool};
}
module.exports={createPhase2aClients};
