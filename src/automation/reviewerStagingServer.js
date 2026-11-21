"use strict";
/**
 * Independent staging reviewer. No merge, dispatch, deployment or repository
 * writes. A verdict can be signed only after authenticated GitHub evidence
 * identifies a different, pinned reviewer approving the exact current SHA.
 */
const http=require("node:http");
const {sign,createPrivateKey,timingSafeEqual}=require("node:crypto");
const {installationReadToken}=require("./githubReviewerAppAuth");
const {inspectWithGithubApp}=require("./githubAppPrTriage");
const {evaluateStagingCorrection}=require("./phase2aStagingCorrectionEndpoint");
const {createPhase2aClients}=require("./phase2aStagingClients");
const SHA=/^[a-f0-9]{40}$/;
const positive=n=>Number.isSafeInteger(n)&&n>0;
function matchingReview({pr,reviews,scope,reviewerId}){
 if(!positive(reviewerId)||!Array.isArray(reviews)||reviews.length>=100||
    !pr||pr.number!==scope.prNumber||pr.head?.sha!==scope.headSha||
    pr.base?.repo?.id!==scope.repositoryId||pr.head?.repo?.id!==scope.repositoryId||
    pr.user?.id===reviewerId||pr.state!=="open"||pr.draft===true)return false;
 const mine=reviews.filter(r=>r?.user?.id===reviewerId&&
    ["APPROVED","CHANGES_REQUESTED","DISMISSED"].includes(r.state)&&
    typeof r.submitted_at==="string"&&Number.isFinite(Date.parse(r.submitted_at)));
 if(!mine.length)return false;
 mine.sort((a,b)=>Date.parse(b.submitted_at)-Date.parse(a.submitted_at)||
    b.id-a.id);
 return mine[0].state==="APPROVED"&&mine[0].commit_id===scope.headSha;
}
function signVerdict(scope,reviewerId,privateKey){
 const record={repositoryId:scope.repositoryId,prNumber:scope.prNumber,
   headSha:scope.headSha,reviewerId,status:"passed",findings:0};
 const bytes=Buffer.from(JSON.stringify(["aca-review-v1",record.repositoryId,
   record.prNumber,record.headSha,record.reviewerId,record.status,record.findings]));
 const key=createPrivateKey(privateKey);
 if(key.asymmetricKeyType!=="ed25519")throw new Error("invalid_signing_key");
 return {record,signature:sign(null,bytes,key).toString("hex")};
}
function equalBearer(header,token){
 if(!token||typeof header!=="string"||!header.startsWith("Bearer "))return false;
 const received=Buffer.from(header.slice(7)),expected=Buffer.from(token);
 return received.length===expected.length&&timingSafeEqual(received,expected);
}
function startServer(env=process.env,{githubTokenProvider=installationReadToken,githubFetch=fetch,phase2aDependencies=null}={}){
 const port=Number(env.PORT??10000);
 const repoName=env.ACA_REVIEW_REPOSITORY||"";
 const parts=repoName.split("/");
 const reviewerId=Number(env.ACA_REVIEWER_ID);
 const repositoryId=Number(env.ACA_REVIEW_REPOSITORY_ID);
 // Create clients only with explicit staging credentials. Missing configuration
 // never falls back to review-signing credentials or a production database.
 let createdClients=null;
 if(!phase2aDependencies&&env.ACA_PHASE2A_ENABLED==="true"){
   try{createdClients=createPhase2aClients(env);}catch{createdClients=null;}
 }
 const correctionClients=phase2aDependencies||createdClients;
 async function github(path){
   const token=await githubTokenProvider({
     appId:Number(env.ACA_REVIEW_GITHUB_APP_ID),
     installationId:Number(env.ACA_REVIEW_GITHUB_INSTALLATION_ID),
     repositoryId,privateKey:env.ACA_REVIEW_GITHUB_APP_PRIVATE_KEY||""
   });
   const response=await githubFetch("https://api.github.com/repos/"+repoName+path,{
     headers:{Authorization:"Bearer "+token,
       Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},
     signal:AbortSignal.timeout(7000),redirect:"error"});
   if(!response.ok)throw new Error("github_review_unavailable");
   return response.json();
 }
 const server=http.createServer(async(req,res)=>{
   res.setHeader("Cache-Control","no-store");
   const answer=(status,data)=>{res.writeHead(status,{"Content-Type":"application/json"});
     res.end(JSON.stringify(data));};
   if(req.method==="GET"&&req.url==="/health")return answer(200,{status:"up",mode:"fail_closed"});
   if(req.method==="POST"&&req.url==="/phase2a/correction-request"){
     // Isolated staging-only endpoint, with a separate token and explicit
     // injected clients. Absence of either dependency disables the endpoint.
     if(env.ACA_PHASE2A_ENABLED!=="true"||
        !equalBearer(req.headers.authorization,env.ACA_PHASE2A_API_TOKEN))
       return answer(401,{error:"unauthorized"});
     let input="";
     try{
       for await(const chunk of req){
         input+=chunk.toString("utf8");
         if(Buffer.byteLength(input)>1024)throw new Error("request_too_large");
       }
       const request=JSON.parse(input);
       const decision=await evaluateStagingCorrection({
         authorization:req.headers.authorization,request,
         config:{enabled:true,bearerToken:env.ACA_PHASE2A_API_TOKEN,
           repositoryId:Number(env.ACA_REVIEW_REPOSITORY_ID),
           workflowId:Number(env.ACA_PHASE2A_WORKFLOW_ID),
           owner:parts[0],repo:parts[1],ledgerRole:env.ACA_PHASE2A_LEDGER_ROLE},
         github:correctionClients?.github,pool:correctionClients?.pool
       });
       return answer(decision.status,decision.body);
     }catch{return answer(400,{error:"invalid_request"});}
   }
   if(req.method!=="POST"||!["/review","/triage"].includes(req.url))return answer(404,{error:"not_found"});
   if(!equalBearer(req.headers.authorization,env.ACA_REVIEW_API_TOKEN))
     return answer(401,{error:"unauthorized"});
   let body="";
   try{
     for await(const chunk of req){body+=chunk.toString("utf8");
       if(Buffer.byteLength(body)>8192)throw new Error("too_large");}
     const scope=JSON.parse(body);
     if(!positive(scope?.repositoryId)||scope.repositoryId!==repositoryId||
        !positive(scope?.prNumber)||!positive(scope?.issueNumber)||
        !SHA.test(scope?.headSha||"")||
        parts.length!==2||!parts.every(x=>/^[A-Za-z0-9_.-]+$/.test(x)))
       return answer(503,{error:"reviewer_not_configured"});
     if(req.url==="/review"&&(!positive(reviewerId)||
         !env.ACA_REVIEW_GITHUB_APP_ID||!env.ACA_REVIEW_GITHUB_INSTALLATION_ID||
         !env.ACA_REVIEW_GITHUB_APP_PRIVATE_KEY||!env.ACA_REVIEW_PRIVATE_KEY))
       return answer(503,{error:"reviewer_not_configured"});
     if(req.url==="/triage"){
       // Advisory only. A triage finding (including a clean patch) never
       // generates a signed verdict or satisfies independent review.
       if(!env.ACA_REVIEW_GITHUB_APP_PRIVATE_KEY||
          !Number.isSafeInteger(Number(env.ACA_REVIEW_GITHUB_APP_ID))||
          !Number.isSafeInteger(Number(env.ACA_REVIEW_GITHUB_INSTALLATION_ID)))
         return answer(503,{status:"blocked",reason:"github_app_not_configured",independent:false});
       const result=await inspectWithGithubApp({
         appId:Number(env.ACA_REVIEW_GITHUB_APP_ID),
         installationId:Number(env.ACA_REVIEW_GITHUB_INSTALLATION_ID),
         privateKey:env.ACA_REVIEW_GITHUB_APP_PRIVATE_KEY,
         repositoryId,owner:parts[0],repo:parts[1],
         prNumber:scope.prNumber,headSha:scope.headSha,
         installationTokenProvider:githubTokenProvider,fetchImpl:githubFetch
       });
       return answer(result.status==="blocked"?409:200,result);
     }
     const pr=await github("/pulls/"+scope.prNumber);
     const reviews=await github("/pulls/"+scope.prNumber+"/reviews?per_page=100");
     if(!matchingReview({pr,reviews,scope,reviewerId}))
       return answer(409,{error:"independent_review_not_verified"});
     // Re-read the PR immediately before signing. Reject a head changed
     // while GitHub review pages were being fetched (TOCTOU defense).
     const confirmed=await github("/pulls/"+scope.prNumber);
     const latestReviews=await github("/pulls/"+scope.prNumber+"/reviews?per_page=100");
     if(!matchingReview({pr:confirmed,reviews:latestReviews,scope,reviewerId}))
       return answer(409,{error:"review_head_changed"});
     return answer(200,signVerdict(scope,reviewerId,
       env.ACA_REVIEW_PRIVATE_KEY.replace(/\\n/g,String.fromCharCode(10))));
   }catch{return answer(503,{error:"review_evidence_unavailable"});}
 });
 if(createdClients?.pool)server.on("close",()=>{void createdClients.pool.end().catch(()=>{});});
 server.listen(port,"0.0.0.0");
 return server;
}
if(require.main===module)startServer();
module.exports={matchingReview,signVerdict,equalBearer,startServer};
