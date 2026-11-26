"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {operationalConsole}=require("../src/voice/voiceLogger");
test("acceptance outcomes survive operational logger without secrets",()=>{
 const records=[],log=console.log,warn=console.warn;
 try{
 console.log=console.warn=value=>records.push(value);
 for(const outcome of ["ready","oauth-denied","fixture-denied","sent","failed"]){
 operationalConsole.log("ACA_STAGING_EMAIL_ACCEPTANCE",{acceptanceOutcome:outcome,token:"secret",email:"private@example.test"});
 }
 operationalConsole.warn("ACA_STAGING_EMAIL_ACCEPTANCE",{acceptanceOutcome:"secret-token",providerBody:"private"});
 }finally{console.log=log;console.warn=warn;}
 assert.deepEqual(records,["ready","oauth-denied","fixture-denied","sent","failed"].map(acceptanceOutcome=>({event:"ACA_STAGING_EMAIL_ACCEPTANCE",acceptanceOutcome})).concat({event:"ACA_STAGING_EMAIL_ACCEPTANCE"}));
});
