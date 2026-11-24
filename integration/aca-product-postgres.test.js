"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {Pool}=require("pg");
test("isolated product migration chain and verified onboarding",async()=>{
 const pool=new Pool({connectionString:"postgres://onboarding_test:onboarding_test_only@localhost:5432/onboarding_test"});
 try{
 await pool.query("CREATE TABLE public.master_tenants(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,business_name TEXT,preferred_lang TEXT,region TEXT); CREATE TABLE public.billing_invoices(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id INTEGER,amount_usd NUMERIC,status TEXT); CREATE TABLE public.analytics_events(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id INTEGER,event_type TEXT,quantity NUMERIC,unit TEXT,meta JSONB,created_at TIMESTAMP DEFAULT NOW());");
 for(const name of fs.readdirSync("migrations").filter(n=>/^0(0[7-9]|1[0-7])_.*\.sql$/.test(n)).sort())await pool.query(fs.readFileSync("migrations/"+name,"utf8"));
 const {issueChallenge}=require("../src/security/onboardingChallenge");
 const {provisionVerifiedBusiness}=require("../src/security/provisionVerifiedBusiness");
 const {prepareRouting}=require("../src/security/prepareRouting");
 const email="product-fixture@example.test",businessName="Disposable business";
 const {token,challenge}=issueChallenge({email,businessName});
 await pool.query("INSERT INTO public.onboarding_challenges(token_hash,purpose,email,business_name,expires_at) VALUES($1,$2,$3,$4,$5)",[challenge.tokenHash,challenge.purpose,email,businessName,new Date(challenge.expiresAt)]);
 const result=await provisionVerifiedBusiness({pool,token,email,businessName});assert.equal(result.ok,true);
 const tenantId=result.result.tenantId;
 assert.equal((await provisionVerifiedBusiness({pool,token,email,businessName})).ok,false);
 await prepareRouting(pool,{tenantId,workflowId:"generic",phoneNumber:"+14165550123"});
 const {rows}=await pool.query("SELECT i.is_active AS identity_active,r.is_active AS notification_active,n.is_active AS number_active,c.is_active AS workflow_active FROM aca_business_identities i JOIN aca_notification_recipients r USING(tenant_id) JOIN tenant_phone_numbers n USING(tenant_id) JOIN tenant_workflow_configs c USING(tenant_id) WHERE i.tenant_id=$1",[tenantId]);
 assert.deepEqual(rows,[{identity_active:true,notification_active:false,number_active:false,workflow_active:false}]);
 }finally{await pool.end();}
});
