"use strict";
const {randomBytes,createHash,createPrivateKey,createPublicKey}=require("node:crypto");
const jwt=require("jsonwebtoken");
const scope="aca:profile:read";
const digest=value=>createHash("sha256").update(value).digest("hex");
const pkce=value=>createHash("sha256").update(value).digest("base64url");
const verifierPattern=/^[A-Za-z0-9._~-]{43,128}$/;
function createOAuthAuthorization({pool,issuer,resource,clientId,redirectUri,loginSecret,privateKey}){
 if(!pool||typeof pool.query!=="function"||typeof loginSecret!=="string"||Buffer.byteLength(loginSecret)<32||typeof clientId!=="string"||!clientId)throw Error("OAUTH_CONFIG");
 for(const value of [issuer,resource,redirectUri]){
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.hash)throw Error("OAUTH_CONFIG");
 }
 const key=privateKey?.type==="private"?privateKey:createPrivateKey(privateKey);
 if(key.asymmetricKeyType!=="rsa"||key.asymmetricKeyDetails.modulusLength<2048)throw Error("OAUTH_CONFIG");
 function validateRequest(request){
  if(!request||request.client_id!==clientId||request.redirect_uri!==redirectUri||request.resource!==resource||request.scope!==scope||request.response_type!=="code"||request.code_challenge_method!=="S256"||typeof request.code_challenge!=="string"||! /^[A-Za-z0-9_-]{43}$/.test(request.code_challenge)||typeof request.state!=="string"||!request.state||request.state.length>1024)throw Error("INVALID_REQUEST");
 }
 // Caller must obtain explicit user consent in an authenticated, CSRF-protected interaction.
 // Never mount this function directly as an anonymous HTTP endpoint.
 async function authorize(request,loginToken){
  validateRequest(request);
  const claims=jwt.verify(loginToken,loginSecret,{algorithms:["HS256"],issuer:"alphine-ai",audience:"aca-business"});
  if(claims.aud!=="aca-business"||claims.purpose!=="verified_business"||typeof claims.sub!=="string"||!claims.sub||!Number.isSafeInteger(claims.tenant_id)||claims.tenant_id<=0||!Number.isInteger(claims.exp))throw Error("INVALID_IDENTITY");
  const code=randomBytes(32).toString("base64url");
  const {rows}=await pool.query(`INSERT INTO public.aca_marketplace_oauth_codes(code_hash,email,tenant_id,client_id,redirect_uri,resource,challenge,expires_at)
 SELECT $1,email,tenant_id,$2,$3,$4,$5,NOW()+INTERVAL '2 minutes' FROM public.aca_business_identities WHERE email=$6 AND tenant_id=$7 AND is_active AND verified_at IS NOT NULL RETURNING code_hash`,[digest(code),clientId,redirectUri,resource,request.code_challenge,claims.sub,claims.tenant_id]);
  if(rows.length!==1)throw Error("INVALID_IDENTITY");
  return {code,state:request.state};
 }
 async function exchange(request){
  if(!request||request.grant_type!=="authorization_code"||request.client_id!==clientId||request.redirect_uri!==redirectUri||request.resource!==resource||typeof request.code!=="string"||! /^[A-Za-z0-9_-]{43}$/.test(request.code)||typeof request.code_verifier!=="string"||!verifierPattern.test(request.code_verifier))throw Error("INVALID_GRANT");
  const {rows}=await pool.query(`DELETE FROM public.aca_marketplace_oauth_codes c USING public.aca_business_identities i
 WHERE c.code_hash=$1 AND c.client_id=$2 AND c.redirect_uri=$3 AND c.resource=$4 AND c.challenge=$5 AND c.expires_at>NOW()
 AND i.email=c.email AND i.tenant_id=c.tenant_id AND i.is_active AND i.verified_at IS NOT NULL RETURNING c.email,c.tenant_id`,[digest(request.code),clientId,redirectUri,resource,pkce(request.code_verifier)]);
  if(rows.length!==1||typeof rows[0].email!=="string"||!Number.isSafeInteger(rows[0].tenant_id)||rows[0].tenant_id<=0)throw Error("INVALID_GRANT");
  return {access_token:jwt.sign({sub:rows[0].email,tenant_id:rows[0].tenant_id,scope},key,{algorithm:"RS256",issuer,audience:resource,expiresIn:300}),token_type:"Bearer",expires_in:300,scope};
 }
 return {authorize,exchange,validateRequest,publicKey:createPublicKey(key)};
}
module.exports={createOAuthAuthorization};
