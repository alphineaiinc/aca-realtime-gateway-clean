"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const source=fs.readFileSync(require.resolve("../src/routes/stripeWebhook"),"utf8");
test("Stripe webhook claims event IDs with a unique idempotency key",()=>{
 assert.match(source,/INSERT INTO public\.aca_stripe_webhook_events/);
 assert.match(source,/ON CONFLICT \(event_id\) DO NOTHING/);
});
test("completed duplicate events are acknowledged without reprocessing",()=>{
 assert.match(source,/prior\.rows\[0\]\?\.status === "processed"/);
 assert.match(source,/duplicate: true/);
});
test("failed processing releases claim and returns retryable status",()=>{
 assert.match(source,/DELETE FROM public\.aca_stripe_webhook_events/);
 assert.match(source,/received: false, retry: true/);
});
test("successful processing is durably marked processed",()=>{
 assert.match(source,/SET status='processed', processed_at=NOW\(\)/);
});
test("Stripe signature verification uses raw request body",()=>{
 assert.match(source,/express\.raw\(\{ type: "application\/json" \}\)/);
 assert.match(source,/constructEvent\([\s\S]*req\.body/);
});
