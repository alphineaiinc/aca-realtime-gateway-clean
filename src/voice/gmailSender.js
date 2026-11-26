"use strict";
const {randomUUID}=require("node:crypto");
const address=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
function createGmailSender(env=process.env,fetcher=globalThis.fetch){
 const {GMAIL_CLIENT_ID:id,GMAIL_CLIENT_SECRET:secret,GMAIL_REFRESH_TOKEN:refresh,GMAIL_FROM:from}=env;
 if(!id||!secret||!refresh||!address.test(from||""))throw Error("GMAIL_NOT_CONFIGURED");
 async function post(url,headers,body){
  try{
   const res=await fetcher(url,{method:"POST",headers,body,redirect:"error",signal:AbortSignal.timeout(10000)});
   if(!res.ok){await res.body?.cancel();throw Error("GMAIL_PROVIDER_REJECTED");}
   return await res.json();
  }catch{throw Error("GMAIL_PROVIDER_FAILED");}
 }
 return async ({to,subject,text,messageId})=>{
  if(!address.test(to||"")||typeof subject!=="string"||/[\r\n]/.test(subject)||typeof text!=="string"||text.length>65536||subject.length>200)throw Error("GMAIL_INVALID_MESSAGE");
  const mid=messageId||"<"+randomUUID()+"@alphineai.com>";
  if(!/^<[A-Za-z0-9.-]+@[A-Za-z0-9.-]+>$/.test(mid))throw Error("GMAIL_INVALID_MESSAGE");
  const token=await post("https://oauth2.googleapis.com/token",{"content-type":"application/x-www-form-urlencoded"},new URLSearchParams({client_id:id,client_secret:secret,refresh_token:refresh,grant_type:"refresh_token"}).toString());
  if(typeof token?.access_token!=="string"||!token.access_token.trim()||/\s/.test(token.access_token))throw Error("GMAIL_TOKEN_INVALID");
  const mime=["From: "+from,"To: "+to,"Subject: =?UTF-8?B?"+Buffer.from(subject).toString("base64")+"?=","Message-ID: "+mid,"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",Buffer.from(text).toString("base64").match(/.{1,76}/g)?.join("\r\n")||""].join("\r\n");
  const result=await post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{"content-type":"application/json",authorization:"Bearer "+token.access_token},JSON.stringify({raw:Buffer.from(mime).toString("base64url")}));
  if(typeof result?.id!=="string"||!result.id.trim())throw Error("GMAIL_SEND_UNCONFIRMED");
  return {accepted:[to],messageId:mid};
 };
}
module.exports={createGmailSender};
