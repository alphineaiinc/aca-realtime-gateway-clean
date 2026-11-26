"use strict";
// No SIP listener or network trust is established here. A trusted gateway verifier
// must authenticate signaling and media separately, returning canonical identity.
function createSipGatewayAdapter({verifySignaling,verifyMedia,lookupBinding,store}){
 if(typeof verifySignaling!=="function"||typeof verifyMedia!=="function")throw Error("INVALID_SIP_VERIFIER");
 const {createCarrierMediaAdmission}=require("./carrierMediaAdmission");
 const make=verify=>createCarrierMediaAdmission({authenticate:async input=>{
  const identity=await verify(input);
  return identity?.carrier==="sip"?identity:null;
 },lookupBinding,store});
 const signaling=make(verifySignaling),media=make(verifyMedia);
 return Object.freeze({issue:input=>signaling.issue(input),consume:(input,token)=>media.consume(input,token)});
}
module.exports={createSipGatewayAdapter};
