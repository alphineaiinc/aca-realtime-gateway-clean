"use strict";
/**
 * Read-only, fail-closed GitHub REST adapter. Caller supplies an authenticated
 * request function; no token, URL, or repository identity comes from PR content.
 * The transport MUST refuse redirects, enforce TLS verification, timeout and
 * response size limits. This adapter also rejects unexpected response shapes.
 */
const OWNER=/^[A-Za-z0-9-]{1,39}$/;
const REPO=/^[A-Za-z0-9_.-]{1,100}$/;
const SHA=/^[a-f0-9]{40}$/;
const positive=n=>Number.isSafeInteger(n)&&n>0;
function createGithubProvenanceApi({owner,repo,request}={}){
 if(!OWNER.test(owner||"")||!REPO.test(repo||"")||typeof request!=="function")
  throw Error("invalid_trusted_github_adapter_configuration");
 const prefix=`https://api.github.com/repos/${owner}/${repo}`;
 async function read(path){
  if(typeof path!=="string"||!path.startsWith("/")||path.includes("..")||
   path.includes("#")||path.includes("?"))throw Error("invalid_github_api_path");
  const url=prefix+path;
  const result=await request(url,Object.freeze({method:"GET",redirect:"manual",
   headers:Object.freeze({Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"})}));
  if(!result||result.status!==200||result.redirected===true||
   !result.data||typeof result.data!=="object"||Array.isArray(result.data))
   throw Error("untrusted_github_api_response");
  return result.data;
 }
 async function list(path,page,perPage,key){
  if(!positive(page)||!positive(perPage)||perPage>100)throw Error("invalid_github_page");
  // Query is built from validated numeric values, never from external content.
  const url=`${prefix}${path}?per_page=${perPage}&page=${page}`;
  const result=await request(url,Object.freeze({method:"GET",redirect:"manual",
   headers:Object.freeze({Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"})}));
  if(!result||result.status!==200||result.redirected===true||
   !result.data||!Number.isSafeInteger(result.data.total_count)||
   !Array.isArray(result.data[key]))throw Error("untrusted_github_page");
  return {total_count:result.data.total_count,items:result.data[key]};
 }
 return Object.freeze({
  getPullRequest(n){if(!positive(n))throw Error("invalid_pr_number");return read(`/pulls/${n}`);},
  listCheckRuns(sha,page,perPage){if(!SHA.test(sha||""))throw Error("invalid_head_sha");
   return list(`/commits/${sha}/check-runs`,page,perPage,"check_runs");},
  listWorkflowRuns(id,page,perPage){if(!positive(id))throw Error("invalid_workflow_id");
   return list(`/actions/workflows/${id}/runs`,page,perPage,"workflow_runs");}
 });
}
module.exports={createGithubProvenanceApi};
