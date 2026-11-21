"use strict";
/**
 * Validate a pinned reviewer endpoint before retrieving signed evidence.
 * HTTPS transport is mandatory; no URL, credentials or signer keys come
 * from PR/issue content. Caller must supply an authenticated transport.
 */
function createTrustedReviewProvider({endpoint,transport,allowedHost}={}){
 let url;
 try{url=new URL(endpoint);}catch{throw new Error("invalid_reviewer_endpoint");}
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||
    url.hostname!==allowedHost||!allowedHost||url.port)
   throw new Error("invalid_reviewer_endpoint");
 if(typeof transport!=="function")throw new Error("missing_authenticated_reviewer_transport");
 return async function trustedReviewProvider(scope){
   if(!scope||!Number.isSafeInteger(scope.repositoryId)||scope.repositoryId<=0||
      !Number.isSafeInteger(scope.issueNumber)||scope.issueNumber<=0||
      !Number.isSafeInteger(scope.prNumber)||scope.prNumber<=0||
      !/^[a-f0-9]{40}$/.test(scope.headSha||""))
     throw new Error("invalid_reviewer_scope");
   // Transport must authenticate the service and enforce redirect denial,
   // timeouts, response size limits and TLS identity. Never follow redirects.
   const result=await transport(url.toString(),Object.freeze({...scope}));
   if(!result||typeof result!=="object"||Array.isArray(result)||
      !result.record||typeof result.signature!=="string")
     throw new Error("invalid_reviewer_response");
   return result;
 };
}
module.exports={createTrustedReviewProvider};
