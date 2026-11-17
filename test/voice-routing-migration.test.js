"use strict";
// Embedded PostgreSQL, with synthetic rows only. Never uses DATABASE_URL or pg.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { createTenantResolver } = require("../src/voice/tenantResolver");
const { createTwilioRouting } = require("../src/voice/twilioRouting");
const twilio = require("twilio");

test("migration enforces routing constraints, atomic grants, and reversible rollback", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE public.master_tenants (id INTEGER PRIMARY KEY, preferred_lang TEXT, region TEXT); INSERT INTO master_tenants VALUES (7, 'fr-CA', 'CA'), (9, 'en-GB', 'GB');");
    await db.exec(fs.readFileSync(path.join(__dirname, "../migrations/007_secure_voice_routing.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(__dirname, "../migrations/008_voice_webhook_retries.sql"), "utf8"));
    const schema = { cluster_id: "synthetic_intake", version: 1,
      slot_definitions: { request: { type: "string" } },
      intents: [{ intent: "capture_request", required_slots: ["request"], optional_slots: [], confirmation_slots: ["request"] }],
      intake_profile: { required: ["request"], optional: [], slotQuestions: { request: "What is your request?" } } };
    await db.query("INSERT INTO voice_workflow_definitions VALUES ($1, 1, $2, true)", [schema.cluster_id, JSON.stringify(schema)]);
    await db.exec("INSERT INTO tenant_workflow_configs VALUES (7, 'synthetic_intake', 1, true), (9, 'synthetic_intake', 1, true); INSERT INTO tenant_phone_numbers VALUES ('+14165550101', 7, true), ('+14165550102', 9, true);");
    await assert.rejects(db.query("INSERT INTO tenant_phone_numbers VALUES ('+14165550101', 9, true)"), /unique|duplicate/i);
    await assert.rejects(db.query("INSERT INTO tenant_phone_numbers VALUES ('4165550101', 7, true)"), /check/i);
    await assert.rejects(db.query("INSERT INTO tenant_phone_numbers VALUES ('+14165550103', 999, true)"), /foreign key/i);
    await assert.rejects(db.query("INSERT INTO tenant_workflow_configs VALUES (7, 'synthetic_intake', 1, true)"), /unique|duplicate/i);
    await assert.rejects(db.query("INSERT INTO tenant_workflow_configs VALUES (9, 'missing', 1, true) ON CONFLICT (tenant_id) DO UPDATE SET workflow_id = EXCLUDED.workflow_id"), /foreign key/i);
    const query = (...args) => db.query(...args);
    const resolve = createTenantResolver({ query });
    assert.equal((await resolve({ calledNumber: "+14165550101" })).tenantId, 7);
    assert.equal((await resolve({ calledNumber: "+14165550102" })).tenantId, 9);
    const env = { TWILIO_AUTH_TOKEN: "synthetic", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
      TWILIO_VOICE_WEBHOOK_URL: "https://example.test/twilio/voice", TWILIO_STREAM_URL: "wss://example.test/ws/twilio-stream" };
    const routing = createTwilioRouting({ query, resolve, env });
    const body = { AccountSid: env.TWILIO_ACCOUNT_SID, CallSid: `CA${"b".repeat(32)}`, To: "+14165550101" };
    const response = { status(code) { this.code = code; return this; }, type() { return this; }, send(xml) { this.xml = xml; return this; } };
    await routing.voiceWebhook({ body, headers: { "x-twilio-signature": twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_VOICE_WEBHOOK_URL, body) } }, response);
    assert.equal(response.code, 200);
    const start = { accountSid: body.AccountSid, callSid: body.CallSid, streamSid: `MZ${"c".repeat(32)}`,
      customParameters: { routingToken: response.xml.match(/name="routingToken" value="([^"]+)"/)[1] } };
    const signedRequest = { body, headers: { "x-twilio-signature": twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_VOICE_WEBHOOK_URL, body) } };
    const concurrentRetries = await Promise.all([1, 2, 3].map(async () => {
      const retry = { ...response }; await routing.voiceWebhook(signedRequest, retry); return retry;
    }));
    assert.ok(concurrentRetries.every((r) => r.code === 200 && r.xml === response.xml));
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM voice_stream_grants")).rows[0].n, 1);
    const claims = await Promise.all([routing.consumeStart(start), routing.consumeStart(start)]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean).tenantId, 7);
    assert.equal(await routing.consumeStart(start), null);
    await routing.voiceWebhook({ body, headers: { "x-twilio-signature": twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_VOICE_WEBHOOK_URL, body) } }, response);
    assert.equal(response.code, 200);
    assert.ok(!response.xml.includes("<Stream"), "Consumed retry must not create another Stream");
    await db.exec("UPDATE tenant_phone_numbers SET is_active = false WHERE tenant_id = 7");
    assert.equal((await resolve({ calledNumber: "+14165550101" })).reason, "INACTIVE_NUMBER");
    await db.exec(fs.readFileSync(path.join(__dirname, "../migrations/rollback/008_voice_webhook_retries.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(__dirname, "../migrations/rollback/007_secure_voice_routing.sql"), "utf8"));
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM master_tenants")).rows[0].n, 2);
    assert.equal((await db.query("SELECT to_regclass('public.tenant_phone_numbers') AS relation")).rows[0].relation, null);
    assert.equal((await resolve({ calledNumber: "+14165550102" })).reason, "ROUTING_UNAVAILABLE");
  } finally { await db.close(); }
});
