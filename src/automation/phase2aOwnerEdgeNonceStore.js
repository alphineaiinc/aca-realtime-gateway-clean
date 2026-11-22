"use strict";
/** Unwired, staging-only replay claim store. No connection on import. */
const {createHash}=require("node:crypto");
function createOwnerEdgeNonceStore({pool}={}){
 if(typeof pool?.query!=="function")throw Error("nonce_store_not_configured");
 return Object.freeze({
  async claimOnce({nonce,expiresAt,repositoryId}={}){
   if(typeof nonce!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(nonce)||
      !Number.isSafeInteger(repositoryId)||repositoryId<1||
      !Number.isSafeInteger(expiresAt))return false;
   const now=Date.now();
   if(expiresAt<=now||expiresAt-now>60000)return false;
   const digest=createHash("sha256").update(nonce).digest("hex");
   // No RETURNING means INSERT-only role needs no SELECT privilege.
   // Exact primary key provides atomic across-instance replay denial.
   try{
    const row=await pool.query(`INSERT INTO aca_automation.owner_edge_proof_nonces
     (nonce_digest,repository_id,expires_at)
     VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
     [digest,repositoryId,new Date(expiresAt)]);
    return row.rowCount===1;
   }catch{return false;}
  }
 });
}
module.exports={createOwnerEdgeNonceStore};
