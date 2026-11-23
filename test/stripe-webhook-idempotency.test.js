"use strict";
const {test}=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");
const source=fs.readFileSync(require.resolve("../src/routes/stripeWebhook"),"utf8");
test("webhook is disabled by default",()=>assert.ok(source.includes('ACA_STRIPE_WEBHOOK_ENABLED!=="true"')));
test("signature verified before database insertion",()=>assert.ok(source.indexOf("constructEvent(req.body")<source.indexOf("await pool.query")));
test("event and inbox insertion share one atomic statement",()=>{assert.ok(source.includes("WITH claimed AS (INSERT"));assert.ok(source.includes("ON CONFLICT (event_id) DO NOTHING"));assert.ok(source.includes("INSERT INTO public.aca_stripe_event_inbox"));});
test("webhook does not send email or claim settlement",()=>{assert.ok(!source.includes("sendBillingEmail"));assert.ok(!source.includes("UPDATE billing_invoices"));});
test("database failure requests retry",()=>assert.ok(source.includes("res.status(500).json({received:false,retry:true})")));
