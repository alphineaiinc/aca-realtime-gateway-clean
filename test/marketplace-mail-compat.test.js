"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const nodemailer=require("nodemailer");
test("notification MIME serialization preserves recipient and text without network",async()=>{
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:"unix",disableFileAccess:true,disableUrlAccess:true});
 try{
 const result=await transport.sendMail({from:"aca@example.invalid",to:"fixture@example.invalid",subject:"ACA notification",text:"Appointment request received"});
 assert.deepEqual(result.envelope.to,["fixture@example.invalid"]);
 assert.match(result.message.toString(),"Appointment request received");
 }finally{transport.close();}
});
