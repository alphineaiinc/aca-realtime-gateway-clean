"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EventEmitter } = require("node:events");
const { isolated, capture } = require("./helpers/isolated.cjs");
const logger = require("../src/voice/voiceLogger");
const canary = "SENSITIVE_CUSTOMER_TOKEN_CANARY_72841";

test("strict metadata allowlist drops identifiers, free text, nested values and accessors", (t) => {
  const records = capture(t);
  const error = new Error(canary); error.code = "ECONNRESET"; error.response = { data: canary, headers: { authorization: canary } };
  const metadata = { callSid: canary, tenantId: 7, phone: canary, routingContext: { token: canary },
    transcript: canary, slots: { name: canary }, error, bytes: 160, chars: 42, status: "completed", branch: "main",
    nested: { bytes: canary }, state: canary, statusCode: canary };
  Object.defineProperty(metadata, "peak", { get() { throw new Error("Getter must not run"); } });
  for (const method of ["log", "warn", "error"]) logger.operationalConsole[method](canary, metadata, JSON.stringify({ nested: canary }));
  logger.logEvent(canary, "TRANSCRIPT_FINAL", metadata); logger.logDecision(canary, canary, metadata); logger.logError(canary, error, metadata);
  const serialized = JSON.stringify(records);
  assert.ok(!serialized.includes(canary)); assert.ok(!serialized.includes("tenantId"));
  assert.ok(serialized.includes("ECONNRESET")); assert.ok(serialized.includes('"bytes":160'));
});

test("both TTS providers redact input, identifiers, API fragments and provider errors", async (t) => {
  const records = capture(t); let fail = false; const inputs = [];
  const providerError = () => Object.assign(new Error(canary), { status: 502, response: { status: 502, statusText: canary, data: { detail: canary } }, code: canary });
  const tts = isolated("tts.js", {
    openai: class { constructor() { this.audio = { speech: { create: async (request) => {
      inputs.push(request.input);
      if (fail) throw providerError(); return { arrayBuffer: async () => Buffer.alloc(480).buffer };
    } } }; } },
    axios: { post: async (_url, request) => { inputs.push(request.text); if (fail) throw providerError(); return { data: Buffer.alloc(80) }; } },
    "./src/brain/utils/voiceProfileLoader": { getTenantVoiceProfile: async () => null },
    "./src/brain/utils/prosodyEngine": { applyProsody: (s) => s },
    "./src/brain/utils/fillers": { injectFillers: (s) => s },
    "./src/brain/utils/accentShaper": { applyAccentShaping: (s) => s },
  }, { OPENAI_API_KEY: canary, ELEVENLABS_API_KEY: canary });
  for (const provider of ["openai", "elevenlabs"]) {
    await tts.synthesizeSpeech(canary, "en-US", { provider, tenantId: 72841 });
    fail = true; await assert.rejects(tts.synthesizeSpeech(canary, "en-US", { provider, tenantId: 72841 })); fail = false;
  }
  assert.equal(inputs.length, 4); assert.ok(inputs.every((input) => input.includes(canary)));
  const output = JSON.stringify(records); assert.ok(!output.includes(canary));
  assert.ok(!output.includes(canary.slice(0, 5))); assert.ok(!output.includes('"tenantId"'));
});

test("STT provider errors do not emit nested error content", (t) => {
  const records = capture(t); let source;
  const stt = isolated("src/brain/utils/sttGoogle.js", { "@google-cloud/speech": { SpeechClient: class {
    streamingRecognize() { source = new EventEmitter(); source.write = () => true; source.destroy = () => {}; return source; }
  } } });
  const transcriber = stt.createStreamingTranscriber({ onError() {} });
  source.emit("error", new Error(canary)); transcriber.destroy();
  assert.ok(!JSON.stringify(records).includes(canary));
});

test("Twilio transcript callbacks and debug buffer retain only operational metadata", async (t) => {
  const records = capture(t); let callbacks;
  const route = isolated("src/routes/twilio.js", {
    dotenv: { config() {} }, "../../retriever": {}, "../../tts": { synthesizeSpeech: async () => Buffer.alloc(80) },
    "../brain/utils/voiceProfileLoader": { getTenantVoiceProfile: async () => ({ lang_code: "en-US" }) },
    "../brain/utils/sttGoogle": { createStreamingTranscriber: (opts) => { callbacks = opts; return { destroy() {}, writeAudio() {} }; } },
    "../voice/twilioRouting": { getRouting: () => ({ consumeStart: async () => ({ tenantId: 7, languageCode: "en-US", calledNumber: canary }) }) },
    "../voice/voiceSessionStore": { getSession: () => null },
    "../voice/sessionController": { handleCallStarted() {}, handleGreeting: () => ({ shouldSpeak: false }),
      handleTranscriptPartial() {}, handleTranscriptFinal: () => ({ shouldProcess: true }),
      handleCallerTurn: async () => ({ replyText: canary }), handleProcessingResult: () => ({ shouldSpeak: false }),
      handleCallEnded() {} },
  });
  class Socket extends EventEmitter { readyState=1; send() {} close() { this.readyState=3; this.emit("close"); } }
  const ws = new Socket(); await route.handleTwilioStream(ws, {});
  await ws.listeners("message")[0](JSON.stringify({ event: "start", start: { callSid: canary, streamSid: canary, customParameters: { token: canary } } }));
  callbacks.onInterim(canary); callbacks.onFinal(canary);
  await new Promise((resolve) => setTimeout(resolve, 180));
  ws.close();
  assert.ok(!JSON.stringify(records).includes(canary));
  const debug = route.getTwilioDebugState(); assert.ok(debug.events.some((e) => e.event === "dispatch_turn"));
  assert.ok(!JSON.stringify(debug).includes(canary));
  assert.ok(!JSON.stringify(debug).includes("callSid"));
});

test("actual controller logs omit transcripts, slots, routing context and nested extraction errors", async (t) => {
  const records = capture(t);
  const { createTenantResolver } = require("../src/voice/tenantResolver");
  const schema = { cluster_id: "synthetic", version: 1, slot_definitions: { request: { type: "string" } },
    intents: [{ intent: "capture", required_slots: ["request"], optional_slots: [], confirmation_slots: ["request"] }],
    intake_profile: { required: ["request"], optional: [], slotQuestions: { request: "Synthetic question" } } };
  const callId = `CA${"d".repeat(32)}`; let fail = false;
  const resolve = createTenantResolver({ query: async (sql) => ({ rows: sql.includes("tenant_phone_numbers") ? [{ tenant_id: 7, is_active: true }] :
    [{ workflow_id: "synthetic", workflow_version: 1, is_active: true, definition_active: true, schema_json: schema }] }) });
  const routing = await resolve({ calledNumber: "+14165550101", callSid: callId });
  const c = isolated("src/voice/sessionController.js", {
    "./workflowExtractor": { extractWorkflowTurn: async () => {
      if (fail) throw Object.assign(new Error(canary), { response: { data: { secret: canary } } });
      return { intent: "capture", slot_updates: { request: canary } };
    } }, "./workflowReplyComposer": { composeReply: async () => canary },
  });
  c.handleCallStarted(callId, { routingContext: routing });
  c.handleTranscriptPartial(callId, canary); c.handleTranscriptFinal(callId, canary);
  const result = await c.handleCallerTurn({ callSid: callId, transcript: canary });
  assert.equal(result.slots.request, canary);
  fail = true; await c.handleCallerTurn({ callSid: callId, transcript: canary }); c.handleCallEnded(callId);
  const output = JSON.stringify(records);
  for (const sensitive of [canary, callId, "+14165550101", '"routingContext"', '"tenantId"']) assert.ok(!output.includes(sensitive));
});

test("retrieval errors do not leak content through console or retry telemetry", async (t) => {
  const records = capture(t); const metrics = [];
  const retriever = isolated("retriever.js", {
    pg: { Pool: class { async query() { throw new Error(canary); } } },
    openai: class { constructor() { this.embeddings = { create: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) }; } },
    "./src/monitor/resilienceMetrics": { observeHttpRetry: (event) => metrics.push(event) },
  }, { OPENAI_API_KEY: "synthetic", DATABASE_URL: "postgresql://synthetic:synthetic@localhost/synthetic" });
  await retriever.retrieveAnswer(canary, 7, "en-US", canary);
  assert.ok(!JSON.stringify(records).includes(canary)); assert.ok(!JSON.stringify(metrics).includes(canary));
  assert.equal(metrics[0].reason, "RETRIEVAL_FAILED");
});

test("root malformed-request diagnostics omit query strings and unverified request metadata", (t) => {
  const records = capture(t); const fs = require("node:fs"); const path = require("node:path"); const vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8");
  const first = source.indexOf("app.use((err, req, res, next) => {"); const last = source.indexOf("\n});", first) + 5;
  assert.ok(first >= 0 && last > first); let handler;
  vm.runInNewContext(source.slice(first, last), { app: { use(fn) { handler = fn; } }, console: logger.operationalConsole, SyntaxError });
  let status;
  handler(new SyntaxError(`Invalid JSON ${canary}`), { originalUrl: `/twilio/status?To=${canary}`, url: canary, path: "/twilio/status", method: "POST", ip: canary, headers: { "content-type": canary } },
    { status(code) { status = code; return this; }, send() {} }, () => { throw new Error("Must handle parse failure"); });
  assert.equal(status, 400); assert.ok(!JSON.stringify(records).includes(canary));
});
