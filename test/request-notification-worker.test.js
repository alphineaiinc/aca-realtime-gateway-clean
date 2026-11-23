"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");
const {deliverOne}=require("../src/voice/requestNotificationWorker");
function fixture(rows){const queries=[];let released=false;return {queries,get released(){return released},pool:{connect:async()=>({query:async(sql,p)=>{queries.push([sql,p]);return {rows:sql.includes("SELECT")?rows:[]}},release(){released=true}})}}}
const row={request_id:1,tenant_id:7,email:"business@example.test"};
test("verified recipient receives PII-free notification and tenant-scoped acknowledgement",async()=>{const f=fixture([row]);assert.equal(await deliverOne({pool:f.pool,sendMail:async mail=>{assert.equal(mail.to,row.email);assert.match(mail.text,/Sign in/);assert.equal(mail.details,undefined);return {accepted:[row.email]}}}),true);assert.deepEqual(f.queries.find(q=>q[0].startsWith("UPDATE"))[1],[1,7]);assert.ok(f.released)});
test("provider failure retains pending notification",async()=>{const f=fixture([row]);await assert.rejects(deliverOne({pool:f.pool,sendMail:async()=>{throw Error("offline")}}),/REQUEST_NOTIFICATION_FAILED/);assert.ok(f.queries.some(q=>q[0]==="ROLLBACK"));assert.ok(!f.queries.some(q=>q[0].startsWith("UPDATE")));assert.ok(f.released)});
test("no eligible recipient means no delivery",async()=>{const f=fixture([]);assert.equal(await deliverOne({pool:f.pool,sendMail:async()=>{throw Error("unexpected")}}),false)});
