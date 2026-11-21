"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const Module=require("node:module");
const path=require("node:path");

test("billing SMTP transport validates certificates and mock send never contacts network",async()=>{
 const modulePath=require.resolve("../src/brain/utils/emailer.js");
 const prior=Module._load;
 const captured=[];
 let sends=0;
 try {
   Module._load=function(request,parent,isMain) {
     if(request==="nodemailer" && parent?.filename===modulePath) {
       return {createTransport(config){
         captured.push(config);
         return {async sendMail(mail){sends++;return {accepted:[mail.to],messageId:"offline-fixture"};}};
       }};
     }
     return prior.apply(this,arguments);
   };
   delete require.cache[modulePath];
   const {sendBillingEmail}=require(modulePath);
   assert.equal(captured.length,1);
   assert.equal(captured[0].secure,true);
   assert.equal(captured[0].tls.rejectUnauthorized,true);
   const result=await sendBillingEmail("fixture@example.invalid","Fixture","<p>Only a mock</p>","Only a mock");
   assert.equal(sends,1);
   assert.equal(result.messageId,"offline-fixture");
 } finally {
   Module._load=prior;
   delete require.cache[modulePath];
 }
});
