"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { isolated, capture } = require("./helpers/isolated.cjs");
const { createTenantResolver } = require("../src/voice/tenantResolver");
const store = require("../src/voice/voiceSessionStore");
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error("Synthetic lifecycle timeout"); await new Promise((r) => setTimeout(r, 5)); }
}
let sequence = 700;
async function harness(t) {
  const callSid = `CA${String(++sequence).padStart(32, "0")}`; const streamSid = `MZ${"f".repeat(32)}`;
  const schema = { cluster_id: "synthetic", version: 1, slot_definitions: { request: { type: "string" } },
    intents: [{ intent: "capture", required_slots: ["request"], optional_slots: [], confirmation_slots: ["request"] }],
    intake_profile: { required: ["request"], optional: [], slotQuestions: { request: "Synthetic next question?" } } };
  const resolve = createTenantResolver({ query: async (sql) => ({ rows: sql.includes("tenant_phone_numbers") ?
    [{ tenant_id: 7, is_active: true }] : [{ workflow_id: "synthetic", workflow_version: 1, is_active: true, definition_active: true, schema_json: schema }] }) });
  const context = await resolve({ calledNumber: "+14165550101", callSid });
  const controller = isolated("src/voice/sessionController.js", {
    "./workflowExtractor": { extractWorkflowTurn: async () => ({}) },
    "./workflowReplyComposer": { composeReply: async () => "Synthetic next question?" },
  });
  const jobs = []; let stt;
  const route = isolated("src/routes/twilio.js", {
    dotenv: { config() {} }, "../../retriever": {},
    "../../tts": { synthesizeSpeech: () => new Promise((resolve, reject) => {
      const job = { done: false, succeed(bytes = 80) { this.done = true; resolve(Buffer.alloc(bytes)); }, fail() { this.done = true; reject(new Error("synthetic TTS failure")); } }; jobs.push(job);
    }) },
    "../brain/utils/voiceProfileLoader": { getTenantVoiceProfile: async () => ({ lang_code: "en-US" }) },
    "../brain/utils/sttGoogle": { createStreamingTranscriber: (options) => { stt = options; return { destroy() {}, writeAudio() {} }; } },
    "../voice/twilioRouting": { getRouting: () => ({ consumeStart: async () => context }) },
    "../voice/sessionController": controller,
  });
  class Socket extends EventEmitter {
    readyState = 1; sent = []; holdMedia = false; failMedia = false; failMark = false; acceptMedia = null;
    send(raw, callback) {
      const data = JSON.parse(raw);
      if (data.event === "mark" && this.failMark) { callback?.(new Error("synthetic mark queue failure")); return; }
      if (data.event === "media" && this.failMedia) { callback?.(new Error("synthetic queue failure")); return; }
      const accept = () => { this.sent.push(data); callback?.(); };
      if (data.event === "media" && this.holdMedia) this.acceptMedia = accept; else accept();
    }
    close() { if (this.readyState !== 3) { this.readyState = 3; this.emit("close"); } }
    async event(data) { await this.listeners("message")[0](JSON.stringify(data)); }
  }
  const ws = new Socket(); await route.handleTwilioStream(ws, {});
  const startup = ws.event({ event: "start", start: { callSid, streamSid } });
  await until(() => jobs.length === 1);
  t.after(async () => { ws.close(); for (const job of jobs) if (!job.done) job.succeed(0); await startup; });
  return { ws, jobs, startup, callSid, controller, stt: () => stt,
    lengths: () => ws.sent.filter((m) => m.event === "media").map((m) => Buffer.from(m.media.payload, "base64").length),
    async greet() { jobs[0].succeed(80); await startup; const mark = ws.sent.find((m) => m.event === "mark"); await ws.event({ event: "mark", mark: mark.mark }); await new Promise((r) => setTimeout(r, 140)); },
  };
}
for (const order of ["greeting-first", "caller-first"]) test(`caller owns overlapping synthesis: ${order}`, async (t) => {
  const records = capture(t); const h = await harness(t);
  h.stt().onFinal("need help"); await until(() => h.jobs.length === 2);
  if (order === "greeting-first") { h.jobs[0].succeed(80); await h.startup; h.jobs[1].succeed(160); }
  else { h.jobs[1].succeed(160); await until(() => !h.ws.__dispatchInFlight); h.jobs[0].succeed(80); await h.startup; }
  await until(() => !h.ws.__dispatchInFlight);
  assert.deepEqual(h.lengths(), [160]); assert.equal(h.ws.__lastCommittedTranscript, "need help");
  assert.equal(h.ws.__pendingVoiceTranscript, ""); assert.ok(!JSON.stringify(records).includes("STATE_REJECTED"));
});
test("speech start cancels a pending greeting and late completion cannot play", async (t) => {
  const h = await harness(t); h.stt().onSpeechStart(); h.jobs[0].succeed(80); await h.startup;
  assert.deepEqual(h.lengths(), []); assert.equal(store.getSession(h.callSid).state, "listening");
});
test("failed caller synthesis retains input and permits a later caller retry", async (t) => {
  const h = await harness(t); await h.greet(); h.stt().onFinal("need help"); await until(() => h.jobs.length === 2);
  h.jobs[1].fail(); await until(() => !h.ws.__dispatchInFlight);
  assert.equal(h.ws.__pendingVoiceTranscript, "need help"); assert.equal(h.ws.__lastCommittedTranscript, "");
  assert.equal(store.getSession(h.callSid).state, "listening");
  h.stt().onFinal("need help"); await until(() => h.jobs.length === 3); h.jobs[2].succeed(160); await until(() => !h.ws.__dispatchInFlight);
  assert.deepEqual(h.lengths(), [80, 160]); assert.equal(h.ws.__pendingVoiceTranscript, "");
});
test("disconnect during caller synthesis prevents late sends and removes session", async (t) => {
  const h = await harness(t); await h.greet(); h.stt().onFinal("need help"); await until(() => h.jobs.length === 2);
  h.ws.close(); h.jobs[1].succeed(160); await until(() => !h.ws.__dispatchInFlight);
  assert.deepEqual(h.lengths(), [80]); assert.equal(store.getSession(h.callSid), undefined);
  assert.equal(h.ws.__lastCommittedTranscript, "");
});
test("media queue rejection retains input instead of claiming delivery", async (t) => {
  const h = await harness(t); await h.greet(); h.stt().onFinal("need help"); await until(() => h.jobs.length === 2);
  h.ws.failMedia = true; h.jobs[1].succeed(160); await until(() => !h.ws.__dispatchInFlight);
  assert.equal(h.ws.__pendingVoiceTranscript, "need help"); assert.equal(h.ws.__lastCommittedTranscript, "");
  assert.equal(store.getSession(h.callSid).state, "listening"); assert.deepEqual(h.lengths(), [80]);
});
test("input remains pending until media and mark are accepted for delivery", async (t) => {
  const h = await harness(t); await h.greet(); h.stt().onFinal("need help"); await until(() => h.jobs.length === 2);
  h.ws.holdMedia = true; h.jobs[1].succeed(160); await until(() => h.ws.acceptMedia !== null);
  assert.equal(h.ws.__pendingVoiceTranscript, "need help"); assert.equal(h.ws.__lastCommittedTranscript, "");
  h.ws.holdMedia = false; h.ws.acceptMedia(); await until(() => !h.ws.__dispatchInFlight);
  assert.equal(h.ws.__pendingVoiceTranscript, ""); assert.deepEqual(h.lengths(), [80, 160]);
});
test("new caller input cancels an older response without clearing the newer buffer", async (t) => {
  const h = await harness(t); await h.greet(); h.stt().onFinal("need help"); await until(() => h.jobs.length === 2);
  h.stt().onSpeechStart(); h.stt().onFinal("other help"); h.jobs[1].succeed(160);
  await until(() => h.jobs.length === 3); assert.equal(h.ws.__pendingVoiceTranscript, "other help");
  h.jobs[2].succeed(240); await until(() => !h.ws.__dispatchInFlight);
  assert.deepEqual(h.lengths(), [80, 240]); assert.equal(h.ws.__lastCommittedTranscript, "other help");
});

test("speech start cancels pending caller synthesis without replaying retained input", async (t) => {
  const h = await harness(t); await h.greet(); h.stt().onFinal("need help"); await until(() => h.jobs.length === 2);
  h.stt().onSpeechStart(); h.jobs[1].succeed(160); await until(() => !h.ws.__dispatchInFlight);
  await new Promise((r) => setTimeout(r, 180));
  assert.equal(h.jobs.length, 2); assert.deepEqual(h.lengths(), [80]);
  assert.equal(h.ws.__pendingVoiceTranscript, "need help"); assert.equal(h.ws.__lastCommittedTranscript, "");
});
test("active greeting interruption clears queued audio and stale marks cannot end the caller reply", async (t) => {
  const h = await harness(t); h.jobs[0].succeed(80); await h.startup;
  const oldMark = h.ws.sent.find((m) => m.event === "mark").mark;
  h.stt().onSpeechStart(); assert.ok(h.ws.sent.some((m) => m.event === "clear"));
  await new Promise((r) => setTimeout(r, 140)); h.stt().onFinal("need help");
  await until(() => h.jobs.length === 2); h.jobs[1].succeed(160); await until(() => !h.ws.__dispatchInFlight);
  await h.ws.event({ event: "mark", mark: oldMark }); assert.equal(store.getSession(h.callSid).state, "speaking");
  const marks = h.ws.sent.filter((m) => m.event === "mark");
  assert.notEqual(marks[0].mark.name, marks[1].mark.name);
  await h.ws.event({ event: "mark", mark: marks[1].mark }); assert.equal(store.getSession(h.callSid).state, "awaiting_input");
  assert.deepEqual(h.lengths(), [80, 160]);
});

test("late failure of a cancelled greeting cannot reset accepted caller playback", async (t) => {
  const h = await harness(t); h.stt().onFinal("need help"); await until(() => h.jobs.length === 2);
  h.jobs[1].succeed(160); await until(() => !h.ws.__dispatchInFlight);
  h.jobs[0].fail(); await h.startup;
  assert.deepEqual(h.lengths(), [160]); assert.equal(store.getSession(h.callSid).state, "speaking");
  assert.equal(h.ws.__lastCommittedTranscript, "need help");
});
test("mark queue rejection clears partial audio but retains caller input", async (t) => {
  const h = await harness(t); await h.greet(); h.stt().onFinal("need help"); await until(() => h.jobs.length === 2);
  h.ws.failMark = true; h.jobs[1].succeed(160); await until(() => !h.ws.__dispatchInFlight);
  assert.equal(h.ws.__pendingVoiceTranscript, "need help"); assert.equal(h.ws.__lastCommittedTranscript, "");
  assert.equal(store.getSession(h.callSid).state, "listening"); assert.ok(h.ws.sent.some((m) => m.event === "clear"));
});

test("interim text cancels pending greeting even without a speech-start event", async (t) => {
  const h = await harness(t); h.stt().onInterim("need help"); h.jobs[0].succeed(80); await h.startup;
  assert.deepEqual(h.lengths(), []); assert.equal(store.getSession(h.callSid).state, "awaiting_end_of_turn");
});
