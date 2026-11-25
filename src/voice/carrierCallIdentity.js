"use strict";
const {createHash}=require("node:crypto");
// Call only after provider authentication. This is identity derivation, not authentication.
function carrierCallIdentity({carrier,accountId,callId,calledNumber}={}){
 if(typeof carrier!=="string"||!/^[a-z][a-z0-9-]{0,31}$/.test(carrier)||
    [accountId,callId].some(v=>typeof v!=="string"||!/^[A-Za-z0-9._:@+-]{1,128}$/.test(v))||
    typeof calledNumber!=="string"||!/^\+[1-9][0-9]{1,14}$/.test(calledNumber))
   throw Error("INVALID_CARRIER_CALL_IDENTITY");
 return createHash("sha256").update(JSON.stringify(["aca-carrier-call-v1",carrier,accountId,callId,calledNumber])).digest("hex");
}
module.exports={carrierCallIdentity};
