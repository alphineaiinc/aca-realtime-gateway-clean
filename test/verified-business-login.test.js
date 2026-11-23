"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");const jwt=require("jsonwebtoken");
const {issueLogin,redeemLogin}=require("../src/security/verifiedBusinessLogin");
const secret="x".repeat(48);
test("login sends only to active identity returned by database and stores hash",async()=>{let params;await issueLogin({email:"Owner@example.test",query:async(sql,p)=>{params=p;return {rows:[{email:p[1]}]}},sendMail:async mail=>{assert.equal(mail.to,"owner@example.test");assert.ok(!mail.text.includes(params[0]));assert.match(params[0],/^[a-f0-9]{64}$/)}})});
test("unknown identity never sends mail",async()=>{await issueLogin({email:"owner@example.test",query:async()=>({rows:[]}),sendMail:async()=>{throw Error("unexpected")}})});
test("redeem uses database identity and single-use conditional update",async()=>{const token=await redeemLogin({token:"a".repeat(64),secret,query:async(sql,p)=>{assert.match(sql,/consumed_at IS NULL/);assert.notEqual(p[0],"a".repeat(64));return {rows:[{tenant_id:7,email:"owner@example.test"}]}}});assert.equal(jwt.verify(token,secret,{audience:"aca-business",issuer:"alphine-ai",algorithms:["HS256"]}).tenant_id,7)});
test("invalid or consumed challenge cannot mint token",async()=>{assert.equal(await redeemLogin({token:"bad",secret,query:async()=>{throw Error("unexpected")}}),null);assert.equal(await redeemLogin({token:"a".repeat(64),secret,query:async()=>({rows:[]})}),null)});
