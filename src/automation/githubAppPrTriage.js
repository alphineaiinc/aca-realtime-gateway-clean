"use strict";
/**
 * Read-only GitHub REST bridge for authenticated PR security triage.
 * Token must come from the scoped GitHub App installation token provider.
 * Does not perform approval, write operations, signing, or deploys.
 */
const {inspectAuthenticatedPr}=require("./authenticatedPrSecurityTriage");
const positive=x=>Number.isSafeInteger(x)&&x>0;
function createGithubReadClient({token,fetchImpl=fetch,limit=800000}={}){
 if(typeof token!=="string"||token.length<20||typeof fetchImpl!=="function"||
   !Number.isSafeInteger(limit)||limit<4096||limit>2000000)
   throw new Error("invalid_triage_transport_configuration");
 async function read(url){
   const response=await fetchImpl(url,{method:"GET",redirect:"error",
     headers:{"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json",
       "X-GitHub-Api-Version":"2022-11-28"},
     signal:AbortSignal.timeout(8000)});
   if(response?.status!==200||!response.ok||!response.body?.getReader)
     throw new Error("github_triage_read_unavailable");
   if(!/^application\/json(?:\s*;|\s*$)/i.test(response.headers?.get?.("content-type")||""))
     throw new Error("invalid_github_triage_content");
   const sizeHeader=response.headers?.get?.("content-length");
   if(sizeHeader!==null&&sizeHeader!==undefined&&
      (!/^\d+$/.test(sizeHeader)||Number(sizeHeader)>limit))
     throw new Error("oversized_github_triage_content");
   let size=0;const chunks=[],reader=response.body.getReader();
   try{
     for(;;){
       const {done,value}=await reader.read();
       if(done)break;
       if(!(value instanceof Uint8Array))throw new Error("invalid_github_triage_chunk");
       size+=value.byteLength;
       if(size>limit)throw new Error("oversized_github_triage_content");
       chunks.push(Buffer.from(value));
     }
   }catch(e){await reader.cancel().catch(()=>{});throw e;}
   return JSON.parse(Buffer.concat(chunks).toString("utf8"));
 }
 const base=(owner,repo)=>{
   if(!/^[A-Za-z0-9_.-]{1,100}$/.test(owner)||
      !/^[A-Za-z0-9_.-]{1,100}$/.test(repo))
     throw new Error("invalid_github_triage_repository");
   return "https://api.github.com/repos/"+owner+"/"+repo;
 };
 return Object.freeze({rest:{
   repos:{get:async({owner,repo})=>({data:await read(base(owner,repo))})},
   pulls:{
     get:async({owner,repo,pull_number})=>{
       if(!positive(pull_number))throw new Error("invalid_github_triage_pr");
       return {data:await read(base(owner,repo)+"/pulls/"+pull_number)};
     },
     listFiles:async({owner,repo,pull_number,per_page,page})=>{
       if(!positive(pull_number)||per_page!==100||page!==1)
         throw new Error("invalid_github_triage_files_page");
       return {data:await read(base(owner,repo)+"/pulls/"+pull_number+"/files?per_page=100&page=1")};
     }
   }
 }});
}
async function inspectWithGithubApp({appId,installationId,privateKey,
 repositoryId,owner,repo,prNumber,headSha,installationTokenProvider,
 fetchImpl=fetch}={}){
 if(typeof installationTokenProvider!=="function")return Object.freeze({
   status:"blocked",reason:"missing_authenticated_app_token_provider",
   findings:[],independent:false});
 try{
   const token=await installationTokenProvider({appId,installationId,privateKey,repositoryId});
   const github=createGithubReadClient({token,fetchImpl});
   return await inspectAuthenticatedPr({github,owner,repo,repositoryId,prNumber,headSha});
 }catch{
   return Object.freeze({status:"blocked",reason:"github_app_triage_unavailable",
     findings:[],independent:false});
 }
}
module.exports={createGithubReadClient,inspectWithGithubApp};
