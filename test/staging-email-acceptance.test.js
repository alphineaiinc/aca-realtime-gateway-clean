"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {run}=require("../src/voice/stagingEmailAcceptance");
const env={ACA_STAGING_ACCEPTANCE_RUN:"true",RENDER_SERVICE_ID:"srv-dc2ffvm8bjmc73fhn8j0",ACA_STAGING_EMAIL_ONLY:"true",ACA_STAGING_EMAIL_TENANT_ID:"6",ACA_STAGING_EMAIL_REQUEST_ID:"4",ACA_STAGING_EMAIL_RECIPIENT:"contact@alphineai.com",ACA_EMAIL_TRANSPORT:"gmail",GMAIL_CLIENT_ID:"fake",GMAIL_CLIENT_SECRET:"fake",GMAIL_REFRESH_TOKEN:"fake",GMAIL_FROM:"contact@alphineai.com"};
const forbidden=()=>{throw Error("unexpected side effect");};
test("disabled and wrong scope never access database or provider",async()=>{
 for(const [key,value,status] of [["ACA_STAGING_ACCEPTANCE_RUN","false","disabled"],["RENDER_SERVICE_ID","production","scope-denied"],["ACA_STAGING_EMAIL_REQUEST_ID","5","scope-denied"],["ACA_STAGING_EMAIL_TENANT_ID","7","scope-denied"],["ACA_STAGING_EMAIL_RECIPIENT","other@example.test","scope-denied"],["GMAIL_REFRESH_TOKEN","","transport-unconfigured"]]){
 assert.equal(await run({env:{...env,[key]:value},pool:{query:forbidden},fetcher:forbidden,deliver:forbidden}),status);
 }
});
test("database and fixture denial precede OAuth",async()=>{
 assert.equal(await run({env,pool:{query:async()=>({rows:[{db:"production"}]})},fetcher:forbidden,deliver:forbidden}),"database-denied");
 assert.equal(await run({env,pool:{query:async sql=>({rows:sql.includes("current_database")?[{db:"aca_product_staging"}]:[]})},fetcher:forbidden,deliver:forbidden}),"fixture-denied");
});
const pool={query:async sql=>({rows:sql.includes("current_database")?[{db:"aca_product_staging"}]:[{}]})};
test("OAuth failure and preflight cannot reserve or send",async()=>{
 assert.equal(await run({env:{...env,ACA_STAGING_ACCEPTANCE_SEND:"true"},pool,fetcher:async()=>({ok:false}),deliver:forbidden}),"oauth-denied");
 assert.equal(await run({env,pool,fetcher:async()=>({ok:true,json:async()=>({access_token:"fake"})}),deliver:forbidden}),"ready");
});
test("explicit send invokes worker once only after OAuth",async()=>{
 let calls=0;
 assert.equal(await run({env:{...env,ACA_STAGING_ACCEPTANCE_SEND:"true"},pool,fetcher:async()=>({ok:true,json:async()=>({access_token:"fake"})}),deliver:async args=>{calls++;assert.equal(args.pool,pool);assert.equal(typeof args.sendMail,"function");return true;}}),"sent");
 assert.equal(calls,1);
});
