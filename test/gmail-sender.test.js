"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createGmailSender}=require("../src/voice/gmailSender");
const {createMailSender}=require("../src/voice/requestNotificationWorker");
const env={GMAIL_CLIENT_ID:"id",GMAIL_CLIENT_SECRET:"secret",GMAIL_REFRESH_TOKEN:"refresh",GMAIL_FROM:"sender@example.com"};
const mail={to:"recipient@example.com",subject:"Verification",text:"test"};
test("Gmail uses fixed HTTPS endpoints and returns accepted recipient",async()=>{
 const calls=[];
 const send=createGmailSender(env,async(url,opts)=>{calls.push([url,opts]);return {ok:true,json:async()=>calls.length===1?{access_token:"token"}:{id:"message"}}});
 assert.deepEqual((await send(mail)).accepted,[mail.to]);
 assert.equal(calls[0][0],"https://oauth2.googleapis.com/token");
 assert.equal(calls[1][0],"https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
 assert.equal(calls[1][1].headers.authorization,"Bearer token");
 for(const [,opts] of calls){assert.equal(opts.redirect,"error");assert.ok(opts.signal);}
 const mime=Buffer.from(JSON.parse(calls[1][1].body).raw,"base64url").toString();
 assert.match(mime,/To: recipient@example.com/);assert.match(mime,/dGVzdA==/);
});
test("Gmail rejects injection before network and redacts provider errors",async()=>{
 let count=0;const send=createGmailSender(env,async()=>{count++;throw Error("secret refresh token");});
 await assert.rejects(send({...mail,subject:"a\r\nBcc: x"}),/GMAIL_INVALID_MESSAGE/);
 assert.equal(count,0);
 await assert.rejects(send(mail),{message:"GMAIL_PROVIDER_FAILED"});
 assert.equal(count,1);
});
test("Gmail refuses unconfirmed send and incomplete config",async()=>{
 let n=0;const send=createGmailSender(env,async()=>({ok:true,json:async()=>++n===1?{access_token:"token"}:{}}));
 await assert.rejects(send(mail),/GMAIL_SEND_UNCONFIRMED/);
 assert.throws(()=>createMailSender({ACA_EMAIL_TRANSPORT:"gmail"}),/GMAIL_NOT_CONFIGURED/);
 assert.throws(()=>createMailSender({ACA_EMAIL_TRANSPORT:"unknown"}),/EMAIL_TRANSPORT_INVALID/);
 assert.throws(()=>createMailSender({}),/SMTP_NOT_CONFIGURED/);
});

test("Empty notification queue never initializes a provider",async()=>{
 const {deliverOne}=require("../src/voice/requestNotificationWorker");
 const statements=[];
 const client={query:async sql=>{statements.push(sql);return {rows:[]};},release(){statements.push("release");}};
 assert.equal(await deliverOne({pool:{connect:async()=>client}}),false);
 assert.equal(statements[0],"BEGIN");assert.equal(statements.at(-2),"COMMIT");assert.equal(statements.at(-1),"release");
});
