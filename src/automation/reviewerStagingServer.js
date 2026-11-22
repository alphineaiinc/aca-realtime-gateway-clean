"use strict";
/**
 * Independent staging reviewer. No merge, dispatch, deployment or repository
 * writes. A verdict can be signed only after authenticated GitHub evidence
 * identifies a different, pinned reviewer approving the exact current SHA.
 */
const http=require("node:http");
const {sign,createPrivateKey,timingSafeEqual}=require("node:crypto");
const {installationReadToken}=require("./githubReviewerAppAuth");
const {readReviewerGithubAppKey}=require("./reviewerGithubAppSecretFile");
const {inspectWithGithubApp}=require("./githubAppPrTriage");
const {evaluateStagingCorrection}=require("./phase2aStagingCorrectionEndpoint");
const {createPhase2aClients}=require("./phase2aStagingClients");
const {phase2aStartupPreflight}=require("./phase2aStartupPreflight");
const {verifyStagingProof}=require("./phase2aStagingPositiveProof");
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
function startServer(env=process.env,{githubTokenProvider=installationReadToken,githubFetch=fetch,phase2aDependencies=null,githubAppKeyReader=readReviewerGithubAppKey}={}){
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
     repositoryId,privateKey:githubAppKeyReader(env)
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
         !env.ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH||!env.ACA_REVIEW_PRIVATE_KEY))
       return answer(503,{error:"reviewer_not_configured"});
     if(req.url==="/triage"){
       // Advisory only. A triage finding (including a clean patch) never
       // generates a signed verdict or satisfies independent review.
       if(!env.ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH||
          !Number.isSafeInteger(Number(env.ACA_REVIEW_GITHUB_APP_ID))||
          !Number.isSafeInteger(Number(env.ACA_REVIEW_GITHUB_INSTALLATION_ID)))
         return answer(503,{status:"blocked",reason:"github_app_not_configured",independent:false});
       const result=await inspectWithGithubApp({
         appId:Number(env.ACA_REVIEW_GITHUB_APP_ID),
         installationId:Number(env.ACA_REVIEW_GITHUB_INSTALLATION_ID),
         privateKey:githubAppKeyReader(env),
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
 // Run only in an expressly enabled isolated staging service with real
 // server-created clients. Injected test clients never cause live requests.
 if(createdClients&&env.ACA_PHASE2A_ENABLED==="true"&&
    env.ACA_PHASE2A_PREFLIGHT==="true"){
   server.once("listening",()=>{
     void phase2aStartupPreflight({
       github:createdClients.github,pool:createdClients.pool,
       owner:parts[0],repo:parts[1],repositoryId,
       workflowId:Number(env.ACA_PHASE2A_WORKFLOW_ID),
       runId:Number(env.ACA_PHASE2A_PREFLIGHT_RUN_ID),
       prNumber:Number(env.ACA_PHASE2A_PREFLIGHT_PR_NUMBER),
       dbRole:env.ACA_PHASE2A_LEDGER_ROLE
     }).then(result=>{
       console.info("ACA_PHASE2A_PREFLIGHT "+result.status+" "+result.stage);
     }).catch(()=>{
       console.warn("ACA_PHASE2A_PREFLIGHT blocked unexpected_error");
     });
   });
 }
 // One-shot internal fail-closed smoke test. Uses the same authenticated
 // evaluator as HTTP but makes no external inbound request and never dispatches.
 // Enabled only for a separately configured, explicit staging CI run.
 if(createdClients&&env.ACA_PHASE2A_ENABLED==="true"&&
    env.ACA_PHASE2A_SMOKE_ENABLED==="true"){
   server.once("listening",()=>{
     const runId=Number(env.ACA_PHASE2A_SMOKE_RUN_ID);
     if(!positive(runId))return console.warn("ACA_PHASE2A_SMOKE blocked configuration");
     void evaluateStagingCorrection({
       authorization:"Bearer "+env.ACA_PHASE2A_API_TOKEN,
       request:{runId},
       config:{enabled:true,bearerToken:env.ACA_PHASE2A_API_TOKEN,
         repositoryId,workflowId:Number(env.ACA_PHASE2A_WORKFLOW_ID),
         owner:parts[0],repo:parts[1],ledgerRole:env.ACA_PHASE2A_LEDGER_ROLE},
       github:createdClients.github,pool:createdClients.pool
     }).then(decision=>{
       const b=decision?.body;
       if(b?.agentDispatchAuthorized===false&&b?.mergeAuthorized===false&&
          b?.deployAuthorized===false&&decision.status!==200){
         console.info("ACA_PHASE2A_SMOKE blocked "+String(b.state||"unknown")+" "+String(decision.status));
       }else{
         console.warn("ACA_PHASE2A_SMOKE unexpected_decision");
       }
     }).catch(()=>console.warn("ACA_PHASE2A_SMOKE blocked unexpected_error"));
   });
 }
 // One-shot read-only staging proof: isolated from correction authorization.
 // Explicit numeric targets must be supplied in staging env; proof expires
 // within five minutes. It logs no secrets, DB rows or untrusted CI content.
 if(createdClients&&env.ACA_PHASE2A_ENABLED==="true"&&
    env.ACA_PHASE2A_POSITIVE_PROOF_ONCE==="true"){
   server.once("listening",()=>{
     const runId=Number(env.ACA_PHASE2A_PROOF_RUN_ID);
     const prNumber=Number(env.ACA_PHASE2A_PROOF_PR_NUMBER);
     const issueNumber=Number(env.ACA_PHASE2A_PROOF_ISSUE_NUMBER);
     const expectedHeadSha=env.ACA_PHASE2A_PROOF_HEAD_SHA;
     if(!positive(runId)||!positive(prNumber)||!positive(issueNumber)||
        !SHA.test(expectedHeadSha||""))
       return console.warn("ACA_PHASE2A_POSITIVE_PROOF blocked configuration");
     void (async()=>{
       let client;
       try{
         client=await createdClients.pool.connect();
         const identity=await client.query("SELECT current_user AS db_role, pg_has_role(current_user, 'pg_read_all_data', 'member') AS broad_read");
         if(identity?.rows?.length!==1||
            identity.rows[0].db_role!==env.ACA_PHASE2A_LEDGER_ROLE||
            identity.rows[0].broad_read!==false)
           throw Error("untrusted_db_role");
         const grants=await client.query(`SELECT
          has_table_privilege(current_user,'aca_automation.correction_ledgers','SELECT') AS rl,
          has_table_privilege(current_user,'aca_automation.correction_events','SELECT') AS re,
          has_table_privilege(current_user,'aca_automation.correction_ledgers','INSERT,UPDATE,DELETE') AS wl,
          has_table_privilege(current_user,'aca_automation.correction_events','INSERT,UPDATE,DELETE') AS we`);
         const g=grants?.rows?.[0];
         if(grants?.rows?.length!==1||g.rl!==true||g.re!==true||
            g.wl!==false||g.we!==false)throw Error("unsafe_db_grants");
         const result=await verifyStagingProof({
           github:createdClients.github,ledgerClient:client,
           owner:parts[0],repo:parts[1],repositoryId,
           workflowId:Number(env.ACA_PHASE2A_WORKFLOW_ID),
           runId,prNumber,issueNumber,expectedHeadSha,
           expiresAt:Date.now()+5*60*1000
         });
         console.info("ACA_PHASE2A_POSITIVE_PROOF "+result.state+" "+result.stage+
           " authorization="+result.productionAuthorization+
           " dispatch="+result.agentDispatchAuthorized+
           " merge="+result.mergeAuthorized+
           " deploy="+result.deployAuthorized);
       }catch{console.warn("ACA_PHASE2A_POSITIVE_PROOF blocked evidence_unavailable");}
       finally{try{client?.release();}catch{}}
     })();
   });
 }
 server.listen(port,"0.0.0.0");
 return server;
}
if(require.main===module)startServer();
module.exports={matchingReview,signVerdict,equalBearer,startServer};
