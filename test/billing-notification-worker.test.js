"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");const {deliverOne}=require("../src/brain/billingNotificationWorker");
function fixture(){const calls=[];const client={release(){},async query(sql,args){calls.push({sql,args});return {rows:sql.startsWith("SELECT")?[{event_id:"evt_1",email:"billing@example.com",tenant_id:2,invoice_id:1}]:[]};}};return {pool:{connect:async()=>client},calls};}
test("accepted notification marks delivery",async()=>{const f=fixture();assert.equal(await deliverOne({pool:f.pool,sendMail:async m=>({accepted:[m.to]})}),"delivered");assert.ok(f.calls.some(c=>c.sql.includes("SET delivered_at=NOW()")));});
test("failed notification schedules bounded retry",async()=>{const f=fixture();assert.equal(await deliverOne({pool:f.pool,sendMail:async()=>{throw Error("offline");}}),"retry");assert.ok(f.calls.some(c=>c.sql.includes("next_attempt_at=NOW()")));assert.ok(!f.calls.some(c=>c.sql.includes("SET delivered_at=NOW()")));});
