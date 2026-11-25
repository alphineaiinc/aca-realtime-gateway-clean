// src/routes/tenant.js
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const ingressRateLimit=require("../security/ingressLimit").ingressLimit({max:60});

const pool = require("../db/pool");
const requestWindows = new Map();
function requestLimit(req,res,next) {
 const now=Date.now(),key=String(req.ip||"unknown");
 for(const [k,v] of requestWindows) if(v.until<=now) requestWindows.delete(k);
 let bucket=requestWindows.get(key);
 if(!bucket){if(requestWindows.size>=10000)return res.status(429).json({ok:false,error:"Try again later"});bucket={count:0,until:now+60000};}
 if(bucket.count>=30)return res.status(429).json({ok:false,error:"Try again later"});
 bucket.count++;requestWindows.set(key,bucket);next();
}

// ---------------------------------------------------------------------------
// POST /tenant/provision (secured via header API key)
// ---------------------------------------------------------------------------
router.post("/provision", ingressRateLimit, requestLimit, async (req,res) => {
  const crypto = require("node:crypto");
  const expected = Buffer.from(process.env.PROVISION_API_KEY || "");
  const actual = Buffer.from(String(req.headers["x-api-key"] || ""));
  if (!expected.length || actual.length !== expected.length || !crypto.timingSafeEqual(actual,expected)) return res.status(401).json({ok:false,error:"unauthorized"});
  const name = req.body?.business_name;
  if(typeof name !== "string" || !name.trim() || name.length > 255) return res.status(400).json({ok:false,error:"business_name required"});
  try {
    const {rows}=await pool.query("INSERT INTO public.master_tenants (business_name,preferred_lang,region) VALUES ($1,$2,$3) RETURNING id",[name.trim(),req.body.preferred_lang || "en-US",req.body.region || "global"]);
    return res.json({ok:true,tenant_id:rows[0].id,message:"Tenant provisioned; verified routing and login setup required"});
  } catch {return res.status(500).json({ok:false,error:"internal_error"});}
});

// ---------------------------------------------------------------------------
// POST /tenant/login
// ---------------------------------------------------------------------------
router.post("/login", ingressRateLimit, (_req, res) => {
  return res.status(403).json({ok:false,error:"Verified login required"});
});

// ---------------------------------------------------------------------------
// GET /tenant/profile (JWT required)
// ---------------------------------------------------------------------------
router.get("/profile", ingressRateLimit, requestLimit, verifiedBusiness, async (req, res) => {
  try {
    const tenantId = req.verifiedTenantId;

    const { rows } = await pool.query(
      `SELECT id AS tenant_id, business_name, preferred_lang, region FROM public.master_tenants WHERE id=$1`,
      [tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "tenant_not_found" });
    }

    return res.json({ ok: true, profile: rows[0] });
  } catch {
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

const {issueLogin,redeemLogin}=require("../security/verifiedBusinessLogin");
const {createMailSender}=require("../voice/requestNotificationWorker");
const loginWindows=new Map();
function loginLimit(req,res,next){
 const now=Date.now(),key=req.ip||"unknown";
 for(const [k,v] of loginWindows) if(v.until<=now)loginWindows.delete(k);
 const v=loginWindows.get(key)||{count:0,until:now+60000};
 if(v.count>=5||(!loginWindows.has(key)&&loginWindows.size>=10000))return res.status(429).json({ok:false,error:"Try again later"});
 v.count++;loginWindows.set(key,v);next();
}
router.post("/login/start", ingressRateLimit, loginLimit,async(req,res)=>{
 if(process.env.ACA_VERIFIED_LOGIN_ENABLED!=="true")return res.status(503).json({ok:false,error:"Login unavailable"});
 if(process.env.RENDER_SERVICE_ID==="srv-dc2ffvm8bjmc73fhn8j0"){
  if(process.env.ACA_STAGING_LOGIN_EMAIL!=="contact@alphineai.com"||req.body?.email!==process.env.ACA_STAGING_LOGIN_EMAIL)return res.status(202).json({ok:true,message:"If eligible, a sign-in code will be sent."});
 }
 try{await issueLogin({query:(...a)=>pool.query(...a),email:req.body?.email,sendMail:createMailSender()});}catch{}
 return res.status(202).json({ok:true,message:"If eligible, a sign-in code will be sent."});
});
router.post("/login/redeem", ingressRateLimit, loginLimit,async(req,res)=>{
 res.set("Cache-Control","no-store");
 if(process.env.ACA_VERIFIED_LOGIN_ENABLED!=="true")return res.status(503).json({ok:false,error:"Login unavailable"});
 try{
 const token=await redeemLogin({query:(...a)=>pool.query(...a),token:req.body?.token,secret:process.env.JWT_SECRET});
 if(token)return res.json({ok:true,token});
 }catch{}
 return res.status(401).json({ok:false,error:"Invalid or expired code"});
});
async function verifiedBusiness(req,res,next){
 res.set("Cache-Control","no-store");
 try{
 const auth=req.headers.authorization||"";
 if(!auth.startsWith("Bearer "))throw Error();
 const claims=jwt.verify(auth.slice(7),process.env.JWT_SECRET,{algorithms:["HS256"],issuer:"alphine-ai",audience:"aca-business"});
 if(claims.purpose!=="verified_business"||!Number.isSafeInteger(claims.tenant_id)||claims.tenant_id<=0||typeof claims.sub!=="string")throw Error();
 const {rows}=await pool.query("SELECT tenant_id FROM public.aca_business_identities WHERE email=$1 AND tenant_id=$2 AND is_active",[claims.sub,claims.tenant_id]);
 if(rows.length!==1)throw Error();
 req.verifiedTenantId=claims.tenant_id;next();
 }catch{return res.status(401).json({ok:false,error:"unauthorized"});}
}
router.get("/requests", ingressRateLimit, loginLimit,verifiedBusiness,async(req,res)=>{
 try{
 const {rows}=await pool.query("SELECT id,workflow_id,intent,details,created_at FROM public.aca_customer_requests WHERE tenant_id=$1 ORDER BY id DESC LIMIT 100",[req.verifiedTenantId]);
 res.set("Cache-Control","no-store");return res.json({ok:true,requests:rows});
 }catch{return res.status(500).json({ok:false,error:"internal_error"});}
});

// Owner-authorized onboarding only; disabled until staging acceptance.
router.post("/onboarding/start", ingressRateLimit, loginLimit,async(req,res)=>{
 if(process.env.ACA_ONBOARDING_ENABLED!=="true")return res.status(503).json({ok:false,error:"Onboarding unavailable"});
 const crypto=require("node:crypto"),expected=Buffer.from(process.env.PROVISION_API_KEY||""),actual=Buffer.from(String(req.headers["x-api-key"]||""));
 if(!expected.length||actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return res.status(401).json({ok:false,error:"unauthorized"});
 try{
 const {token,challenge}=require("../security/onboardingChallenge").issueChallenge({email:req.body?.email,businessName:req.body?.business_name});
 await pool.query("INSERT INTO public.onboarding_challenges(token_hash,purpose,email,business_name,expires_at) VALUES($1,$2,$3,$4,$5)",[challenge.tokenHash,challenge.purpose,challenge.email,challenge.businessName,new Date(challenge.expiresAt)]);
 const result=await createMailSender()({to:challenge.email,subject:"Alphine AI onboarding verification",text:"Your onboarding code is "+token});
 if(!result?.accepted?.includes(challenge.email))throw Error();
 return res.status(202).json({ok:true});
 }catch{return res.status(400).json({ok:false,error:"Onboarding request unsuccessful"});}
});
router.post("/onboarding/redeem", ingressRateLimit, loginLimit,async(req,res)=>{
 if(process.env.ACA_ONBOARDING_ENABLED!=="true")return res.status(503).json({ok:false,error:"Onboarding unavailable"});
 try{
 const result=await require("../security/provisionVerifiedBusiness").provisionVerifiedBusiness({pool,token:req.body?.token,email:req.body?.email,businessName:req.body?.business_name});
 if(result.ok)return res.status(201).json({ok:true,...result.result});
 }catch{}
 return res.status(400).json({ok:false,error:"Invalid or expired onboarding request"});
});
router.post("/routing/prepare", ingressRateLimit, requestLimit,async(req,res)=>{
 if(process.env.ACA_ONBOARDING_ENABLED!=="true")return res.status(503).json({ok:false,error:"Configuration unavailable"});
 const crypto=require("node:crypto"),expected=Buffer.from(process.env.PROVISION_API_KEY||""),actual=Buffer.from(String(req.headers["x-api-key"]||""));
 if(!expected.length||actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return res.status(401).json({ok:false,error:"unauthorized"});
 try{
 const result=await require("../security/prepareRouting").prepareRouting(pool,{tenantId:req.body?.tenant_id,workflowId:req.body?.workflow_id,phoneNumber:req.body?.phone_number});
 return res.status(201).json({ok:true,...result});
 }catch{return res.status(400).json({ok:false,error:"Configuration unsuccessful"});}
});
router.get("/routing/status", ingressRateLimit, requestLimit,verifiedBusiness,async(req,res)=>{
 res.set("Cache-Control","no-store");
 try{
 const {rows}=await pool.query("SELECT c.workflow_id,c.workflow_version,c.is_active AS workflow_active,n.phone_number,n.is_active AS number_active FROM public.tenant_workflow_configs c LEFT JOIN public.tenant_phone_numbers n ON n.tenant_id=c.tenant_id WHERE c.tenant_id=$1 ORDER BY n.phone_number",[req.verifiedTenantId]);
 return res.json({ok:true,routing:rows});
 }catch{return res.status(500).json({ok:false,error:"internal_error"});}
});
module.exports = router;