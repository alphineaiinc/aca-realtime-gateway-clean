"use strict";
/**
 * Pure staging private-bind proposal validator. Deliberately never opens a
 * socket and never authorizes bypassing the loopback-only mTLS listener.
 * A valid proposal is NOT evidence of Render private-network isolation.
 */
const FLAGS=Object.freeze({agentDispatchAuthorized:false,dispatched:false,
 mergeAuthorized:false,deployAuthorized:false,signingAuthorized:false,
 productionAuthorization:false});
const deny=reason=>Object.freeze({ready:false,reason,
 privateBindAuthorized:false,networkIsolationVerified:false,...FLAGS});
function evaluatePrivateStagingBindProposal(input={}){
 if(!input||typeof input!=="object"||Array.isArray(input))return deny("invalid_input");
 if(input.enabled!==true||input.isolatedStaging!==true)
  return deny("disabled");
 if(input.renderServiceType!=="private_service"||
    input.autoDeploy!==false||input.publicIngressEnabled!==false||
    input.productionService===true)
  return deny("unsafe_service_boundary");
 if(input.region!=="virginia"||input.edgeRegion!=="virginia")
  return deny("region_mismatch");
 if(typeof input.privateDns!=="string"||
    !/^[a-z][a-z0-9-]{2,62}\.render-internal\.com$/.test(input.privateDns)||
    input.privateDns!==input.expectedPrivateDns)
  return deny("untrusted_private_dns");
 if(!Number.isSafeInteger(input.port)||input.port<1024||input.port>65535||
    input.bindAddress==="0.0.0.0"||input.bindAddress==="::"||
    typeof input.bindAddress!=="string"||input.bindAddress.length===0)
  return deny("unsafe_bind");
 if(!/^[a-f0-9]{40}$/.test(input.reviewedCommitSha||"")||
    input.reviewerSigningEnabled!==false||
    input.nativeDispatchEnabled!==false)
  return deny("unreviewed_activation");
 // Render network isolation and actual listener interface are operational
 // evidence, not properties this pure function can attest.
 return Object.freeze({ready:true,reason:"proposal_syntax_checked",
  privateBindAuthorized:false,networkIsolationVerified:false,...FLAGS});
}
module.exports={evaluatePrivateStagingBindProposal};
