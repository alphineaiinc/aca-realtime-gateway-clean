"use strict";
/**
 * Independent staging reviewer. No merge, dispatch, deployment or repository
 * writes. A verdict can be signed only after authenticated GitHub evidence
 * identifies a different, pinned reviewer approving the exact current SHA.
 */
const http=require("node:http");
const {sign,createPrivateKey,timingSafeEqual}=require("node:crypto");
const {installationReadToken}=require("./githubReviewerAppAuth");
const SHA=/^[a-f0-9]{40}$/;
const positive=n=>Number.isSafeInteger(n)&&n>0;
function matchingReview({pr,reviews,scope,reviewerId}){
 if(!positive(reviewerId)||!Array.isArray(reviews)||reviews.length>=100||
    !pr||pr.number!==scope.prNumber||pr.head?.sha!==scope.headSha||
    pr.base?.repo?.id!==scope.repositoryId||pr.head?.repo?.id!==scope.repositoryId||
    pr.user?.id===reviewerId||pr.state!=="open")return false;
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
function startServer(env=process.env){
 const port=Number(env.PORT||10000);
 const repoName=env.ACA_REVIEW_REPOSITORY||"";
 const parts=repoName.split("/");
 const reviewerId=Number(env.ACA_REVIEWER_ID);
 const repositoryId=Number(env.ACA_REVIEW_REPOSITORY_ID);
 async function github(path){
   const token=await installationReadToken({
     appId:Number(env.ACA_REVIEW_GITHUB_APP_ID),
     installationId:Number(env.ACA_REVIEW_GITHUB_INSTALLATION_ID),
     repositoryId,privateKey:env.ACA_REVIEW_GITHUB_APP_PRIVATE_KEY||""
   });
   const response=await fetch("https://api.github.com/repos/"+repoName+path,{
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
   if(req.method!=="POST"||req.url!=="/review")return answer(404,{error:"not_found"});
   if(!equalBearer(req.headers.authorization,env.ACA_REVIEW_API_TOKEN))
     return answer(401,{error:"unauthorized"});
   let body="";
   try{
     for await(const chunk of req){body+=chunk.toString("utf8");
       if(Buffer.byteLength(body)>8192)throw new Error("too_large");}
     const scope=JSON.parse(body);
     if(!positive(scope?.repositoryId)||scope.repositoryId!==repositoryId||
        !positive(scope?.prNumber)||!positive(scope?.issueNumber)||
        !SHA.test(scope?.headSha||"")||!positive(reviewerId)||
        parts.length!==2||!parts.every(x=>/^[A-Za-z0-9_.-]+$/.test(x))||
        !env.ACA_REVIEW_GITHUB_APP_ID||!env.ACA_REVIEW_GITHUB_INSTALLATION_ID||
        !env.ACA_REVIEW_GITHUB_APP_PRIVATE_KEY||!env.ACA_REVIEW_PRIVATE_KEY)
       return answer(503,{error:"reviewer_not_configured"});
     const pr=await github("/pulls/"+scope.prNumber);
     const reviews=await github("/pulls/"+scope.prNumber+"/reviews?per_page=100");
     if(!matchingReview({pr,reviews,scope,reviewerId}))
       return answer(409,{error:"independent_review_not_verified"});
     // Re-read the PR immediately before signing. Reject a head changed
     // while GitHub review pages were being fetched (TOCTOU defense).
     const confirmed=await github("/pulls/"+scope.prNumber);
     if(!matchingReview({pr:confirmed,reviews,scope,reviewerId}))
       return answer(409,{error:"review_head_changed"});
     return answer(200,signVerdict(scope,reviewerId,
       env.ACA_REVIEW_PRIVATE_KEY.replace(/\\n/g,String.fromCharCode(10))));
   }catch{return answer(503,{error:"review_evidence_unavailable"});}
 });
 server.listen(port,"0.0.0.0");
 return server;
}
if(require.main===module)startServer();
module.exports={matchingReview,signVerdict,equalBearer,startServer};
