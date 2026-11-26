"use strict";
const {randomBytes,createHash}=require("node:crypto");
const {normalizeEmail}=require("./onboardingChallenge");
const jwt=require("jsonwebtoken");
const hash=token=>createHash("sha256").update(token).digest("hex");
async function issueLogin({query,email,sendMail}){
 email=normalizeEmail(email);
 const token=randomBytes(32).toString("hex");
 const result=await query(`INSERT INTO public.aca_login_challenges(token_hash,email,expires_at)
 SELECT $1,email,NOW()+INTERVAL '10 minutes' FROM public.aca_business_identities
 WHERE email=$2 AND is_active RETURNING email`,[hash(token),email]);
 if(result.rows.length===1) await sendMail({to:email,subject:"Alphine AI sign-in code",text:"Your single-use sign-in code: "+token+" . Expires in 10 minutes."});
}
async function redeemLogin({query,token,secret}){
 if(typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token)||typeof secret!=="string"||Buffer.byteLength(secret)<32) return null;
 const {rows}=await query(`UPDATE public.aca_login_challenges c SET consumed_at=NOW()
 FROM public.aca_business_identities i WHERE c.email=i.email AND i.is_active
 AND c.token_hash=$1 AND c.consumed_at IS NULL AND c.expires_at>NOW()
 RETURNING i.tenant_id,i.email`,[hash(token)]);
 if(rows.length!==1||!Number.isInteger(rows[0].tenant_id)||rows[0].tenant_id<=0)return null;
 return jwt.sign({tenant_id:rows[0].tenant_id,sub:rows[0].email,purpose:"verified_business"},secret,{algorithm:"HS256",issuer:"alphine-ai",audience:"aca-business",expiresIn:"1h"});
}
module.exports={issueLogin,redeemLogin};
