"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { EventEmitter } = require("node:events");
const express = require("express");
const twilio = require("twilio");
const { createTenantResolver } = require("../src/voice/tenantResolver");
const { createTwilioRouting } = require("../src/voice/twilioRouting");
const { loadClusterSchema, validateWorkflowSchema } = require("../src/voice/clusterSchemaLoader");
const store = require("../src/voice/voiceSessionStore");
const account = `AC${"a".repeat(32)}`;
const call = (n) => `CA${String(n).padStart(32, "0")}`;
const stream = `MZ${"c".repeat(32)}`;
const env = { TWILIO_AUTH_TOKEN: "synthetic-auth-token", TWILIO_ACCOUNT_SID: account,
  TWILIO_VOICE_WEBHOOK_URL: "https://example.test/twilio/voice", TWILIO_STREAM_URL: "wss://example.test/ws/twilio-stream" };
function schema(id = "reusable_intake") {
  return { cluster_id: id, version: 1,
    slot_definitions: { request: { type: "string" } },
    intents: [{ intent: "capture_request", required_slots: ["request"], optional_slots: [], confirmation_slots: ["request"] }],
    intake_profile: { required: ["request"], optional: [], slotQuestions: { request: "What would you like help with?" } } };
}
function fixture() {
  const phones = new Map([
    ["+14165550101", [{ tenant_id: 7, is_active: true, preferred_lang: "fr-CA", region: "CA" }]],
    ["+14165550102", [{ tenant_id: 9, is_active: true, preferred_lang: "en-GB", region: "GB" }]],
  ]);
  const workflows = new Map([7, 9].map((id) => [id, [{ workflow_id: "reusable_intake", workflow_version: 1,
    is_active: true, definition_active: true, schema_json: schema() }]]));
  const grants = new Map();
  const calls = [];
  let now = 0;
  async function query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM public.tenant_phone_numbers")) return { rows: phones.get(values[0]) || [] };
    if (sql.includes("FROM public.tenant_workflow_configs")) return { rows: workflows.get(values[0]) || [] };
    if (sql.includes("INSERT INTO public.voice_stream_grants")) {
      if ([...grants.values()].some((g) => g.callSid === values[1])) throw new Error("duplicate call");
      grants.set(values[0], { callSid: values[1], accountSid: values[2], tenant_id: values[3], called_number: values[4], expires: now + 60000 });
      return { rows: [] };
    }
    if (sql.includes("UPDATE public.voice_stream_grants")) {
      const g = grants.get(values[0]);
      if (!g || g.used || g.expires <= now || g.callSid !== values[1] || g.accountSid !== values[2]) return { rows: [] };
      g.used = true;
      return { rows: [{ tenant_id: g.tenant_id, called_number: g.called_number }] };
    }
    throw new Error("Unexpected DB query");
  }
  const resolve = createTenantResolver({ query });
  return { phones, workflows, grants, calls, resolve, routing: createTwilioRouting({ query, resolve, env }), advance: (n) => { now += n; } };
}
async function issue(f, n = 1, to = "+14165550101") {
  const body = { AccountSid: account, CallSid: call(n), To: to };
  let xml;
  const res = { status(code) { this.code = code; return this; }, type() { return this; }, send(value) { xml = value; return this; } };
  await f.routing.voiceWebhook({ body, headers: { "x-twilio-signature": twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_VOICE_WEBHOOK_URL, body) } }, res);
  assert.equal(res.code, 200, xml);
  const token = xml.match(/name="routingToken" value="([^"]+)"/)[1];
  assert.ok(xml.includes('name="calledNumber" value="+14165550101"') || to !== "+14165550101");
  return { callSid: body.CallSid, accountSid: account, streamSid: stream, customParameters: { routingToken: token } };
}
function isolated(relative, mocks) {
  const filename = path.join(__dirname, "..", relative);
  const realRequire = createRequire(filename);
  const req = (name) => Object.hasOwn(mocks, name) ? mocks[name] : realRequire(name);
  req.resolve = realRequire.resolve;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { require: req, module, exports: module.exports,
    __dirname: path.dirname(filename), console: { log() {}, warn() {}, error() {} },
    process: { env: {} }, Buffer, setTimeout, clearTimeout, Date, Set, Map }, { filename });
  return module.exports;
}

test("two tenants resolve independently to an explicit reusable workflow", async () => {
  const f = fixture();
  const a = await f.resolve({ calledNumber: "+14165550101", callSid: call(1), accountSid: account });
  const b = await f.resolve({ calledNumber: "+14165550102", callSid: call(2), accountSid: account });
  assert.equal(a.tenantId, 7); assert.equal(b.tenantId, 9);
  assert.equal(a.languageCode, "fr-CA"); assert.equal(b.languageCode, "en-GB");
  assert.equal(loadClusterSchema(a).cluster_id, "reusable_intake");
  assert.throws(() => loadClusterSchema({ ...a }), /UNVERIFIED/);
  assert.ok(Object.isFrozen(a.schema.intents));
  assert.ok(f.calls.every((q) => !/knowledge|voice_profile|FROM tenants\b/.test(q.sql)));
});
test("missing, unknown, malformed numbers and arbitrary identifiers fail closed", async () => {
  const f = fixture();
  for (const input of [{}, { calledNumber: "+14165559999" }, { calledNumber: "4165550101" },
    { calledNumber: "+14165550101", tenantId: 1 }, { calledNumber: "+14165550101", tenantId: 999 },
    { calledNumber: "+14165550101", businessId: 9 }, { calledNumber: "+14165550101", customParameters: { tenantId: 7 } }]) {
    const result = await f.resolve(input); assert.equal(result.ok, false); assert.equal(result.tenantId, undefined);
  }
});
test("inactive and ambiguous phone mappings reject before workflow access", async () => {
  for (const ambiguous of [false, true]) {
    const f = fixture(); const rows = f.phones.get("+14165550101");
    if (ambiguous) rows.push({ ...rows[0], tenant_id: 9 }); else rows[0].is_active = false;
    assert.equal((await f.resolve({ calledNumber: "+14165550101" })).reason, ambiguous ? "AMBIGUOUS_NUMBER" : "INACTIVE_NUMBER");
    assert.equal(f.calls.length, 1);
  }
});
test("missing, inactive, ambiguous and invalid workflow configurations reject", async () => {
  for (const mode of ["missing", "inactive", "definition", "ambiguous", "invalid", "version"]) {
    const f = fixture(); const rows = f.workflows.get(7);
    if (mode === "missing") rows.length = 0;
    if (mode === "inactive") rows[0].is_active = false;
    if (mode === "definition") rows[0].definition_active = false;
    if (mode === "ambiguous") rows.push({ ...rows[0] });
    if (mode === "invalid") rows[0].schema_json = { required: ["request"] };
    if (mode === "version") rows[0].workflow_version = 2;
    const result = await f.resolve({ calledNumber: "+14165550101" }); assert.equal(result.ok, false, mode);
  }
  assert.throws(() => validateWorkflowSchema(require("../config/clusterIntakeSchemas").medical_clinic));
});
test("database exceptions return non-sensitive failures without fallbacks", async () => {
  const resolve = createTenantResolver({ query: async () => { throw new Error("synthetic sensitive DB detail"); } });
  assert.deepEqual(await resolve({ calledNumber: "+14165550101" }), { ok: false, reason: "ROUTING_UNAVAILABLE" });
});
test("webhook requires the exact public URL signature and configured account", async (t) => {
  const f = fixture(); const app = express();
  app.post("/twilio/voice", express.urlencoded({ extended: false }), f.routing.voiceWebhook);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/twilio/voice`;
  for (const mode of ["missing", "invalid", "altered_body", "wrong_account", "valid", "unknown", "missing_number"]) {
    const body = { AccountSid: account, CallSid: call(50), To: "+14165550101" };
    if (mode === "wrong_account") body.AccountSid = `AC${"b".repeat(32)}`;
    if (mode === "unknown") body.To = "+14165559999";
    if (mode === "missing_number") delete body.To;
    const signature = twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_VOICE_WEBHOOK_URL, body);
    if (mode === "altered_body") body.To = "+14165550102";
    const before = f.calls.length;
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded",
      ...(mode === "missing" ? {} : { "x-twilio-signature": mode === "invalid" ? "bad" : signature }) }, body: new URLSearchParams(body) });
    assert.equal(response.status, mode === "valid" ? 200 : 403, mode);
    if (["missing", "invalid", "altered_body", "wrong_account"].includes(mode)) assert.equal(f.calls.length, before);
  }
});
test("single-use grants bind call/account, expire, and never persist plaintext tokens", async () => {
  const f = fixture(); const start = await issue(f);
  assert.ok([...f.grants.keys()].every((k) => !k.includes(start.customParameters.routingToken)));
  assert.equal(await f.routing.consumeStart({ ...start, callSid: call(99) }), null);
  assert.equal(await f.routing.consumeStart({ ...start, accountSid: `AC${"b".repeat(32)}` }), null);
  const results = await Promise.all([f.routing.consumeStart(start), f.routing.consumeStart(start)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await f.routing.consumeStart(start), null);
  const expired = await issue(f, 2); f.advance(60001);
  assert.equal(await f.routing.consumeStart(expired), null);
  assert.equal(await f.routing.consumeStart({ ...start, customParameters: { tenantId: 7 } }), null);
});
test("mapping revocation or reassignment before stream start cannot switch tenants", async () => {
  for (const mode of ["reassign", "inactive", "workflow"]) {
    const f = fixture(); const start = await issue(f);
    if (mode === "reassign") f.phones.get("+14165550101")[0].tenant_id = 9;
    if (mode === "inactive") f.phones.get("+14165550101")[0].is_active = false;
    if (mode === "workflow") f.workflows.get(7).length = 0;
    assert.equal(await f.routing.consumeStart(start), null);
  }
});
test("trusted context is bound immutably to a session; untrusted creation fails", async () => {
  assert.throws(() => store.createSession(call(99), { tenantId: 1 }), /UNVERIFIED/);
  const f = fixture(); const context = await f.routing.consumeStart(await issue(f, 20));
  const session = store.createSession(context.callSid, { routingContext: context });
  assert.equal(session.tenantId, 7);
  assert.throws(() => { session.tenantId = 9; }, TypeError);
  assert.throws(() => { session.routingContext = { tenantId: 9 }; }, TypeError);
  store.removeSession(context.callSid);
});
test("actual WebSocket path validates routing before session, profile, STT and TTS", async () => {
  const f = fixture(); const effects = []; const starts = [];
  const controller = isolated("src/voice/sessionController.js", {
    "./workflowExtractor": { extractWorkflowTurn: async () => { effects.push("extract"); return {}; } },
    "./workflowReplyComposer": { composeReply: async () => "What would you like help with?" },
  });
  const route = isolated("src/routes/twilio.js", {
    dotenv: { config() {} },
    "../../retriever": { retrieveAnswer: () => { throw new Error("KB must not be reached"); } },
    "../../tts": { synthesizeSpeech: async (_text, language, options) => { effects.push({ tts: options.tenantId, language, region: options.regionCode }); return Buffer.alloc(80); } },
    "../brain/utils/sttGoogle": { createStreamingTranscriber: (options) => { effects.push({ stt: options.languageCode }); starts.push(options); return { destroy() {}, end() {}, writeAudio() {} }; } },
    "../brain/utils/voiceProfileLoader": { getTenantVoiceProfile: async (tenant, language) => { effects.push({ profile: tenant, language }); return { lang_code: language }; } },
    "../voice/twilioRouting": { getRouting: () => f.routing },
    "../voice/sessionController": controller,
  });
  class Socket extends EventEmitter {
    readyState = 1;
    send() {}
    close() { this.readyState = 3; this.emit("close"); }
    async start(start) { await this.listeners("message")[0](JSON.stringify({ event: "start", start })); }
  }
  const rejected = new Socket(); await route.handleTwilioStream(rejected, {});
  await rejected.start({ callSid: call(70), accountSid: account, streamSid: stream, customParameters: { tenantId: 1 } });
  assert.deepEqual(effects, []); assert.equal(store.getSession(call(70)), undefined);
  for (const [n, to, id, lang] of [[71, "+14165550101", 7, "fr-CA"], [72, "+14165550102", 9, "en-GB"]]) {
    const start = await issue(f, n, to);
    // Forged extra identity fields are ignored in favor of the server-side grant.
    start.customParameters.tenantId = id === 7 ? 9 : 7;
    const ws = new Socket(); await route.handleTwilioStream(ws, {}); await ws.start(start);
    const session = store.getSession(call(n));
    assert.equal(session.tenantId, id); assert.equal(session.routingContext.schema.cluster_id, "reusable_intake");
    assert.ok(effects.some((e) => e.profile === id && e.language === lang));
    assert.ok(effects.some((e) => e.tts === id && e.language === lang));
    assert.ok(effects.some((e) => e.stt === lang));
    const reply = await controller.handleCallerTurn({ callSid: call(n), transcript: "hello", meta: { routingContext: session.routingContext } });
    assert.equal(reply.tenantId, id);
    assert.ok(Object.keys(session.slots).every((key) => Object.hasOwn(session.routingContext.schema.slot_definitions, key)));
    const switched = await controller.handleCallerTurn({ callSid: call(n), transcript: "hello", meta: { tenantId: id === 7 ? 9 : 7 } });
    assert.equal(switched.replyType, "routing_error");
    ws.close(); assert.equal(store.getSession(call(n)), undefined);
  }
});
test("voice profile queries stay tenant-scoped and lang_code supplies legacy alias", async () => {
  const seen = [];
  const loader = isolated("src/brain/utils/voiceProfileLoader.js", { "../../db/pool": {
    query: async (_sql, args) => { seen.push(args); return { rowCount: 1, rows: [{ tenant_id: args[0], lang_code: args[1], language_code: "wrong" }] }; },
  } });
  const a = await loader.getTenantVoiceProfile(7, "fr-CA"); const b = await loader.getTenantVoiceProfile(9, "en-GB");
  assert.deepEqual(seen.map((v) => Array.from(v)), [[7, "fr-CA"], [9, "en-GB"]]);
  assert.equal(a.language_code, "fr-CA"); assert.equal(b.language_code, "en-GB");
});

test("missing signing configuration and grant-store failure cannot admit a call", async () => {
  const f = fixture();
  const body = { AccountSid: account, CallSid: call(80), To: "+14165550101" };
  const req = { body, headers: { "x-twilio-signature": twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_VOICE_WEBHOOK_URL, body) } };
  const res = { status(code) { this.code = code; return this; }, send() { return this; } };
  await createTwilioRouting({ query: async () => { throw new Error("must not query"); }, resolve: f.resolve, env: {} }).voiceWebhook(req, res);
  assert.equal(res.code, 503); assert.equal(f.calls.length, 0);
  const failed = createTwilioRouting({ query: async () => { throw new Error("synthetic store failure"); }, resolve: f.resolve, env });
  await failed.voiceWebhook(req, res); assert.equal(res.code, 503);
  assert.equal(await failed.consumeStart({ callSid: call(80), accountSid: account, streamSid: stream, customParameters: { routingToken: "x".repeat(43) } }), null);
});
