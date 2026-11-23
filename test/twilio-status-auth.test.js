"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const twilio = require("twilio");
const { createTwilioRouting } = require("../src/voice/twilioRouting");
const { isolated, capture } = require("./helpers/isolated.cjs");
const account = `AC${"a".repeat(32)}`;
const callSid = `CA${"b".repeat(32)}`;
const canary = "PRIVATE_CALLBACK_CANARY_91827";
const env = { TWILIO_AUTH_TOKEN: "synthetic-only", TWILIO_ACCOUNT_SID: account,
  TWILIO_VOICE_WEBHOOK_URL: "https://example.test/twilio/voice", TWILIO_STREAM_URL: "wss://example.test/ws/twilio-stream" };
async function server(t, configuration = env) {
  let queries = 0;
  const service = createTwilioRouting({ env: configuration,
    query: async () => { queries += 1; throw new Error("Callbacks must not access DB"); },
    resolve: async () => { throw new Error("Callbacks must not resolve tenants"); } });
  const route = isolated("src/routes/twilio.js", {
    dotenv: { config() {} }, "../../retriever": {}, "../../tts": {}, "../brain/utils/sttGoogle": {},
    "../voice/sessionController": {}, "../voice/slotEnforcement": {}, "../voice/voiceSessionStore": {},
    "../brain/utils/voiceProfileLoader": {}, "../voice/twilioRouting": { getRouting: () => service },
  });
  const app = express(); app.use(express.json()); app.use("/twilio", route.router);
  const listener = app.listen(0, "127.0.0.1"); await new Promise((r) => listener.once("listening", r));
  t.after(() => new Promise((r) => listener.close(r)));
  return { base: `http://127.0.0.1:${listener.address().port}`, queries: () => queries };
}
function body() { return { AccountSid: account, CallSid: callSid, CallStatus: "completed", StreamEvent: "stream-stopped",
  From: canary, To: canary, StreamError: canary, StreamName: canary }; }
function signature(url, data) { return twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, url, data); }

test("both status endpoints verify form POST signatures before sanitized diagnostics", async (t) => {
  const s = await server(t); const records = capture(t);
  for (const endpoint of ["status", "stream-status"]) {
    const data = body(); const canonical = `https://example.test/twilio/${endpoint}`;
    const response = await fetch(`${s.base}/twilio/${endpoint}`, { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-twilio-signature": signature(canonical, data), host: "untrusted.example", "x-forwarded-host": "untrusted.example" },
      body: new URLSearchParams(data) });
    assert.equal(response.status, 200);
  }
  assert.equal(s.queries(), 0);
  const output = JSON.stringify(records);
  assert.ok(output.includes("STATUS_CALLBACK")); assert.ok(output.includes("STREAM_STATUS_CALLBACK"));
  assert.ok(!output.includes(canary)); assert.ok(!output.includes(callSid)); assert.ok(!output.includes(account));
});
test("unsigned, tampered, wrong-account and wrong-URL callbacks cannot enter logs", async (t) => {
  const s = await server(t); const records = capture(t);
  for (const endpoint of ["status", "stream-status"]) for (const mode of ["unsigned", "tampered", "account", "url", "host"]) {
    const data = body(); const canonical = `https://example.test/twilio/${endpoint}`;
    if (mode === "account") data.AccountSid = `AC${"c".repeat(32)}`;
    const sig = signature(mode === "url" ? "https://other.test/twilio/status" : mode === "host" ? `${s.base}/twilio/${endpoint}` : canonical, data);
    if (mode === "tampered") data.CallStatus = "failed";
    const before = records.length;
    const response = await fetch(`${s.base}/twilio/${endpoint}`, { method: "POST", headers: {
      "content-type": "application/x-www-form-urlencoded", ...(mode === "unsigned" ? {} : { "x-twilio-signature": sig }) }, body: new URLSearchParams(data) });
    assert.equal(response.status, 403, `${endpoint}:${mode}`); assert.equal(records.length, before);
  }
  assert.equal(s.queries(), 0);
});
test("GET callbacks are rejected even with signatures until a GET contract is approved", async (t) => {
  const s = await server(t); const records = capture(t);
  for (const endpoint of ["status", "stream-status"]) {
    const query = new URLSearchParams(body()).toString();
    const before = records.length;
    const response = await fetch(`${s.base}/twilio/${endpoint}?${query}`, { headers: {
      "x-twilio-signature": signature(`https://example.test/twilio/${endpoint}?${query}`, {}) } });
    assert.equal(response.status, 405); assert.equal(response.headers.get("allow"), "POST"); assert.equal(records.length, before);
  }
});
test("callback parsers reject unsupported media, oversized bodies and excessive fields", async (t) => {
  const s = await server(t); const records = capture(t);
  for (const [type, raw, status] of [["application/json", JSON.stringify(body()), 415],
    ["text/plain", canary, 415], ["application/x-www-form-urlencoded", `StreamError=${canary.repeat(2000)}`, 413],
    ["application/x-www-form-urlencoded", new URLSearchParams(Array.from({ length: 70 }, (_,i) => [`field${i}`, canary])).toString(), 413]]) {
    const before = records.length;
    const response = await fetch(`${s.base}/twilio/stream-status`, { method: "POST", headers: { "content-type": type }, body: raw });
    assert.equal(response.status, status); assert.equal(records.length, before);
  }
});
test("explicit callback URL overrides are validated and used for signature verification", async (t) => {
  const s = await server(t, { ...env, TWILIO_STATUS_WEBHOOK_URL: "https://callbacks.example/twilio/status" });
  const data = body(); const response = await fetch(`${s.base}/twilio/status`, { method: "POST", headers: {
    "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature("https://callbacks.example/twilio/status", data) }, body: new URLSearchParams(data) });
  assert.equal(response.status, 200);
  const bad = await server(t, { ...env, TWILIO_STATUS_WEBHOOK_URL: "http://untrusted.example/twilio/status" });
  const denied = await fetch(`${bad.base}/twilio/status`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data) });
  assert.equal(denied.status, 503); assert.equal(bad.queries(), 0);
});
