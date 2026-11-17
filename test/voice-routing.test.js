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
      const existing = [...grants.entries()].find(([, g]) => g.callSid === values[1]);
      if (existing) {
        const [key, g] = existing;
        if (g.used || g.expires <= now || g.accountSid !== values[2] || g.tenant_id !== values[3] || g.called_number !== values[4]) return { rows: [] };
        return { rows: [{ token_hash: key, token_ciphertext: g.ciphertext }] };
      }
      grants.set(values[0], { callSid: values[1], accountSid: values[2], tenant_id: values[3], called_number: values[4], expires: now + 60000, ciphertext: values[5] });
      return { rows: [{ token_hash: values[0], token_ciphertext: values[5] }] };
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

async function webhookReply(f, n, to = "+14165550101") {
  const body = { AccountSid: account, CallSid: call(n), To: to };
  const res = { status(code) { this.code = code; return this; }, type() { return this; }, send(xml) { this.xml = xml; return this; } };
  await f.routing.voiceWebhook({ body, headers: { "x-twilio-signature": twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_VOICE_WEBHOOK_URL, body) } }, res);
  return res;
}
test("duplicate and concurrent signed webhook retries recover one pending token", async () => {
  const f = fixture();
  const replies = await Promise.all([webhookReply(f, 100), webhookReply(f, 100), webhookReply(f, 100)]);
  assert.ok(replies.every((r) => r.code === 200 && r.xml === replies[0].xml));
  assert.equal(f.grants.size, 1);
  const beforeInvalid = f.calls.length;
  const invalid = { status(code) { this.code = code; return this; }, send() { return this; } };
  await f.routing.voiceWebhook({ body: { AccountSid: account, CallSid: call(100), To: "+14165550101" }, headers: { "x-twilio-signature": "forged" } }, invalid);
  assert.equal(invalid.code, 403); assert.equal(f.calls.length, beforeInvalid);
  const retry = await webhookReply(f, 100);
  assert.equal(retry.xml, replies[0].xml);
  const token = retry.xml.match(/name="routingToken" value="([^"]+)"/)[1];
  assert.ok([...f.grants.values()].every((g) => !g.ciphertext.includes(token)));
  const start = { callSid: call(100), accountSid: account, streamSid: stream, customParameters: { routingToken: token } };
  const claims = await Promise.all([f.routing.consumeStart(start), f.routing.consumeStart(start)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const replay = await webhookReply(f, 100);
  assert.equal(replay.code, 200); assert.ok(!replay.xml.includes("<Stream"));
  assert.equal(await f.routing.consumeStart(start), null);
});
test("expired and conflicting webhook replays acknowledge without renewing or switching", async () => {
  const f = fixture(); await webhookReply(f, 101);
  const grant = [...f.grants.values()][0]; const expiry = grant.expires;
  const conflict = await webhookReply(f, 101, "+14165550102");
  assert.equal(conflict.code, 200); assert.ok(!conflict.xml.includes("<Stream"));
  assert.equal(grant.tenant_id, 7); assert.equal(grant.expires, expiry);
  f.advance(60001);
  const expired = await webhookReply(f, 101);
  assert.equal(expired.code, 200); assert.ok(!expired.xml.includes("<Stream"));
  assert.equal(f.grants.size, 1); assert.equal(grant.expires, expiry);
});
test("damaged retry ciphertext never issues another capability", async () => {
  const f = fixture(); await webhookReply(f, 102);
  [...f.grants.values()][0].ciphertext = "invalid";
  const retry = await webhookReply(f, 102);
  assert.equal(retry.code, 503); assert.equal(f.grants.size, 1);
});

class SecuritySocket extends EventEmitter {
  readyState = 1;
  sent = [];
  closeCode = null;
  send(data) { this.sent.push(JSON.parse(data)); }
  close(code) { this.closeCode = code; this.readyState = 3; this.emit("close"); }
  terminate() { this.readyState = 3; this.emit("close"); }
  async packet(data, binary = false) {
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    await this.listeners("message")[0]?.(raw, binary);
  }
}
function voiceHarness(f, overrides = {}) {
  const effects = { profiles: [], stt: [], audio: [], destroyed: 0, speechComplete: 0 };
  const controller = {
    handleCallStarted: (id, meta) => store.createSession(id, meta),
    handleCallEnded: (id) => { if (store.getSession(id)) store.removeSession(id); },
    handleGreeting: () => ({ shouldSpeak: false }),
    handleTranscriptPartial() {}, handleTranscriptFinal() {}, handleProcessingResult() {},
    handleSpeak() {}, handleSpeechComplete() { effects.speechComplete += 1; }, handleCallerTurn() {},
    ...overrides.controller,
  };
  const route = isolated("src/routes/twilio.js", {
    dotenv: { config() {} },
    "../../retriever": { retrieveAnswer: () => { throw new Error("Unexpected KB access"); } },
    "../../tts": { synthesizeSpeech: overrides.tts || (async () => Buffer.alloc(80)) },
    "../brain/utils/sttGoogle": { createStreamingTranscriber: (opts) => {
      effects.stt.push(opts);
      if (overrides.synchronousSttError) opts.onError(new Error("synthetic synchronous initialization error"));
      return { destroy() { effects.destroyed += 1; }, writeAudio(b) { effects.audio.push(b); } };
    } },
    "../brain/utils/voiceProfileLoader": { getTenantVoiceProfile: async (tenantId, lang) => {
      effects.profiles.push({ tenantId, lang });
      return overrides.profile ? overrides.profile(tenantId, lang) : { lang_code: lang };
    } },
    "../voice/twilioRouting": { getRouting: () => overrides.routing || f.routing },
    "../voice/sessionController": controller,
    ...(overrides.security ? { "../voice/streamSecurity": overrides.security } : {}),
  });
  return { route, effects };
}
function assertNoProviders(effects) {
  assert.equal(effects.profiles.length, 0); assert.equal(effects.stt.length, 0); assert.equal(effects.audio.length, 0);
}
test("malformed, binary, oversized and unexpected messages never initialize providers", async () => {
  const f = fixture(); const { route, effects } = voiceHarness(f);
  for (const [packet, binary, code] of [["{", false, 1008], ["null", false, 1008], ["[]", false, 1008],
    [{ event: "unknown" }, false, 1008], [{ event: "connected" }, true, 1003],
    ["x".repeat(16385), false, 1009], [{ event: "media", media: { payload: "!!!!" } }, false, 1008],
    [{ event: "media", media: { payload: "AAAA" } }, false, 1008]]) {
    const ws = new SecuritySocket(); await route.handleTwilioStream(ws, {}); await ws.packet(packet, binary);
    assert.equal(ws.closeCode, code); assertNoProviders(effects);
  }
});
test("concurrent start messages perform only one claim and no duplicate initialization", async () => {
  const f = fixture(); let finish; let claims = 0;
  const routing = { consumeStart: () => { claims += 1; return new Promise((resolve) => { finish = resolve; }); } };
  const { route, effects } = voiceHarness(f, { routing });
  const ws = new SecuritySocket(); await route.handleTwilioStream(ws, {});
  const start = await issue(f, 110);
  const first = ws.packet({ event: "start", start });
  await ws.packet({ event: "start", start });
  finish(await f.routing.consumeStart(start)); await first;
  assert.equal(claims, 1); assert.equal(ws.closeCode, 1008); assertNoProviders(effects);
  assert.equal(store.getSession(call(110)), undefined);
});
test("early media is bounded and delivered after initialization; stop cleans once", async () => {
  const f = fixture(); let finish;
  const { route, effects } = voiceHarness(f, { profile: () => new Promise((resolve) => { finish = resolve; }) });
  const ws = new SecuritySocket(); await route.handleTwilioStream(ws, {});
  const start = await issue(f, 111);
  const initialization = ws.packet({ event: "start", start });
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  await ws.packet({ event: "media", streamSid: stream, media: { payload: Buffer.alloc(160, 255).toString("base64") } });
  assert.equal(effects.stt.length, 0);
  finish({ lang_code: "fr-CA" }); await initialization;
  assert.equal(effects.stt[0].languageCode, "fr-CA"); assert.equal(effects.audio.length, 1);
  assert.equal(store.getSession(call(111)).tenantId, 7);
  await ws.packet({ event: "stop", stop: { callSid: call(111) } });
  assert.equal(store.getSession(call(111)), undefined); assert.equal(effects.destroyed, 1);
  ws.emit("close"); assert.equal(effects.destroyed, 1);
  effects.stt[0].onFinal("late final"); assert.equal(ws.__voiceTurnTimer, null);
});
test("initialization buffer overflow and disconnect cancel pending voice startup", async () => {
  for (const overflow of [true, false]) {
    const f = fixture(); let finish;
    const { route, effects } = voiceHarness(f, { profile: () => new Promise((resolve) => { finish = resolve; }) });
    const ws = new SecuritySocket(); await route.handleTwilioStream(ws, {});
    const start = await issue(f, overflow ? 112 : 113);
    const initialization = ws.packet({ event: "start", start });
    while (!finish) await new Promise((resolve) => setImmediate(resolve));
    if (overflow) {
      for (let i = 0; i < 129; i += 1) await ws.packet({ event: "media", media: { payload: "AAAA" } });
      assert.equal(ws.closeCode, 1009);
    } else ws.close(1000);
    finish({ lang_code: "fr-CA" }); await initialization;
    assert.equal(effects.stt.length, 0); assert.equal(store.getSession(start.callSid), undefined);
  }
});
test("late TTS, provider errors and mismatched stream metadata cannot escape cleanup", async () => {
  const f = fixture(); let finish;
  const { route, effects } = voiceHarness(f, { controller: { handleGreeting: () => ({ shouldSpeak: true, replyText: "Hello" }) },
    tts: () => new Promise((resolve) => { finish = resolve; }) });
  const ws = new SecuritySocket(); await route.handleTwilioStream(ws, {});
  const start = await issue(f, 114); const initialization = ws.packet({ event: "start", start });
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  effects.stt[0].onError(new Error("synthetic provider failure"));
  finish(Buffer.alloc(80)); await initialization;
  assert.equal(ws.sent.length, 0); assert.equal(effects.destroyed, 1); assert.equal(store.getSession(start.callSid), undefined);
  const next = new SecuritySocket(); await route.handleTwilioStream(next, {});
  const other = await issue(f, 115);
  // This harness greets with delayed TTS, so finish its greeting before testing stream mismatch.
  const pending = next.packet({ event: "start", start: other });
  const previousFinish = finish;
  while (finish === previousFinish) await new Promise((resolve) => setImmediate(resolve));
  finish(Buffer.alloc(80)); await pending;
  await next.packet({ event: "media", streamSid: `MZ${"d".repeat(32)}`, media: { payload: "AAAA" } });
  assert.equal(next.closeCode, 1008); assert.equal(store.getSession(other.callSid), undefined);
});

test("real express-ws transport preserves admission, audio, marks and session cleanup", async (t) => {
  const http = require("node:http"); const { once } = require("node:events");
  const WebSocket = require("ws");
  const f = fixture(); const { route, effects } = voiceHarness(f);
  const app = express(); const server = http.createServer(app);
  // Execute the exact initialization used by the root entry point without starting its services.
  const source = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8");
  const initialization = source.match(/require\("express-ws"\)\(app, server, \{ wsOptions: require\("\.\/src\/voice\/streamSecurity"\)\.WS_OPTIONS \}\);/);
  assert.ok(initialization, "Root must install the bounded transport options");
  vm.runInNewContext(initialization[0], { app, server, require: createRequire(path.join(__dirname, "../index.js")) });
  app.ws("/ws/twilio-stream", route.handleTwilioStream);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `ws://127.0.0.1:${server.address().port}/ws/twilio-stream`;
  const bad = new WebSocket(url); await once(bad, "open");
  const badClosed = once(bad, "close"); bad.send("{");
  assert.equal((await badClosed)[0], 1008); assertNoProviders(effects);
  const oversized = new WebSocket(url); await once(oversized, "open");
  const oversizedClosed = once(oversized, "close"); oversized.send("x".repeat(16385));
  assert.equal((await oversizedClosed)[0], 1009); assertNoProviders(effects);
  const transportLimit = new WebSocket(url); await once(transportLimit, "open");
  const transportClosed = once(transportLimit, "close"); transportLimit.send("x".repeat(1024 * 1024 + 1));
  assert.equal((await transportClosed)[0], 1009); assertNoProviders(effects);
  const client = new WebSocket(url); await once(client, "open");
  assert.equal(client.extensions, "");
  const start = await issue(f, 116);
  client.send(JSON.stringify({ event: "connected" }));
  client.send(JSON.stringify({ event: "start", start }));
  client.send(JSON.stringify({ event: "media", streamSid: stream, media: { payload: Buffer.alloc(160, 255).toString("base64") } }));
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 2000;
    const check = () => effects.audio.length ? resolve() : Date.now() > deadline ? reject(new Error("Audio not delivered")) : setTimeout(check, 5);
    check();
  });
  assert.equal(store.getSession(start.callSid).tenantId, 7);
  assert.equal(effects.stt[0].languageCode, "fr-CA");
  // A mark with no matching playback does not fabricate speech completion.
  client.send(JSON.stringify({ event: "mark", streamSid: stream, mark: { name: "unmatched" } }));
  const closed = once(client, "close"); client.send(JSON.stringify({ event: "stop", streamSid: stream, stop: { callSid: start.callSid } }));
  assert.equal((await closed)[0], 1000);
  assert.equal(effects.speechComplete, 0); assert.equal(effects.destroyed, 1);
  assert.equal(store.getSession(start.callSid), undefined);
});

test("valid greeting TTS preserves media framing and matching playback marks", async () => {
  const f = fixture(); const seen = [];
  const { route, effects } = voiceHarness(f, { controller: { handleGreeting: () => ({ shouldSpeak: true, replyText: "Hello" }) },
    tts: async (_text, language, options) => { seen.push({ language, ...options }); return Buffer.alloc(80); } });
  const ws = new SecuritySocket(); await route.handleTwilioStream(ws, {});
  const start = await issue(f, 117); await ws.packet({ event: "start", start });
  assert.equal(seen[0].tenantId, 7); assert.equal(seen[0].language, "fr-CA"); assert.equal(seen[0].regionCode, "CA");
  assert.equal(seen[0].outputFormat, "ulaw_8000");
  assert.equal(ws.sent[0].event, "media"); assert.equal(ws.sent[0].streamSid, stream);
  assert.equal(Buffer.from(ws.sent[0].media.payload, "base64").length, 80);
  assert.equal(ws.sent[1].event, "mark");
  await ws.packet({ event: "dtmf", streamSid: stream, dtmf: { digit: "1" } });
  assert.equal(ws.closeCode, null); assert.equal(store.getSession(start.callSid).tenantId, 7);
  await ws.packet({ event: "mark", streamSid: stream, mark: ws.sent[1].mark });
  assert.equal(effects.speechComplete, 1);
  ws.close(1000); assert.equal(effects.destroyed, 1); assert.equal(store.getSession(start.callSid), undefined);
});
test("synchronous STT initialization errors destroy the returned provider and session", async () => {
  const f = fixture(); const { route, effects } = voiceHarness(f, { synchronousSttError: true });
  const ws = new SecuritySocket(); await route.handleTwilioStream(ws, {});
  const start = await issue(f, 118); await ws.packet({ event: "start", start });
  assert.equal(ws.closeCode, 1011); assert.equal(effects.destroyed, 1);
  assert.equal(store.getSession(start.callSid), undefined); assert.equal(ws.sent.length, 0);
});
test("explicit workflow intent and configured slots still drive the actual controller", async () => {
  const f = fixture(); const context = await f.routing.consumeStart(await issue(f, 119));
  const controller = isolated("src/voice/sessionController.js", {
    "./workflowExtractor": { extractWorkflowTurn: async () => ({ intent: "capture_request", slot_updates: { request: "synthetic request" } }) },
    "./workflowReplyComposer": { composeReply: async () => "What would you like help with?" },
  });
  controller.handleCallStarted(context.callSid, { routingContext: context });
  const reply = await controller.handleCallerTurn({ callSid: context.callSid, transcript: "a synthetic request", meta: { routingContext: context } });
  assert.equal(reply.tenantId, 7); assert.equal(reply.intent, "capture_request"); assert.equal(reply.slots.request, "synthetic request");
  assert.equal(reply.workflowStatus, "ready_for_confirmation");
  assert.ok(Object.keys(reply.slots).every((key) => Object.hasOwn(context.schema.slot_definitions, key)));
  controller.handleCallEnded(context.callSid);
});
