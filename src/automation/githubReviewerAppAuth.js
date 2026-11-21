"use strict";
/**
 * Scoped GitHub App installation authentication for the staging reviewer.
 * This only supplies an identity and read-only credentials. It does not
 * perform a security review or establish reviewer independence by itself.
 */
const {createPrivateKey,sign}=require("node:crypto");
const positive=n=>Number.isSafeInteger(n)&&n>0;
function makeAppJwt({appId,privateKey,now=Math.floor(Date.now()/1000)}={}){
 if(!positive(appId)||typeof privateKey!=="string"||!privateKey.includes("PRIVATE KEY")||
    !positive(now))throw new Error("invalid_github_app_identity");
 const key=createPrivateKey(privateKey.replace(/\\n/g,"\n"));
 if(key.asymmetricKeyType!=="rsa")throw new Error("invalid_github_app_signing_key");
 const header=Buffer.from(JSON.stringify({alg:"RS256",typ:"JWT"})).toString("base64url");
 const payload=Buffer.from(JSON.stringify({iat:now-60,exp:now+480,iss:String(appId)})).toString("base64url");
 const input=header+"."+payload;
 return input+"."+sign("RSA-SHA256",Buffer.from(input),key).toString("base64url");
}
async function installationReadToken({appId,installationId,privateKey,repositoryId,fetchImpl=fetch}={}){
 if(!positive(installationId)||!positive(repositoryId)||typeof fetchImpl!=="function")
   throw new Error("invalid_github_installation_identity");
 const jwt=makeAppJwt({appId,privateKey});
 const response=await fetchImpl("https://api.github.com/app/installations/"+installationId+"/access_tokens",{
   method:"POST",redirect:"error",
   headers:{Authorization:"Bearer "+jwt,Accept:"application/vnd.github+json",
     "X-GitHub-Api-Version":"2022-11-28"},
   body:JSON.stringify({repository_ids:[repositoryId],
     permissions:{contents:"read",pull_requests:"read",metadata:"read"}}),
   signal:AbortSignal.timeout(7000)
 });
 if(response?.status!==201||!response.ok)
   throw new Error("github_app_token_unavailable");
 const data=await response.json();
 if(typeof data.token!=="string"||data.token.length<20||
    !Array.isArray(data.repositories)||data.repositories.length!==1||
    data.repositories[0]?.id!==repositoryId||
    data.permissions?.contents!=="read"||data.permissions?.pull_requests!=="read"||
    !Number.isFinite(Date.parse(data.expires_at)))
   throw new Error("invalid_github_app_token_scope");
 return data.token;
}
module.exports={makeAppJwt,installationReadToken};
