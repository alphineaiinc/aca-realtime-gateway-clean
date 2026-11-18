"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTenantResolver } = require("../src/voice/tenantResolver");
const store = require("../src/voice/voiceSessionStore");
const { STATES, canTransition } = require("../src/voice/stateMachine");
const { isolated, capture } = require("./helpers/isolated.cjs");
async function controllerSession(n) {
  const schema = { cluster_id: "synthetic_intake", version: 1, slot_definitions: { request: { type: "string" } },
    intents: [{ intent: "capture", required_slots: ["request"], optional_slots: [], confirmation_slots: ["request"] }],
    intake_profile: { required: ["request"], optional: [], slotQuestions: { request: "What is your request?" } } };
  const callSid = `CA${String(n).padStart(32, "0")}`;
  const resolver = createTenantResolver({ query: async (sql) => ({ rows: sql.includes("tenant_phone_numbers") ?
    [{ tenant_id: 7, is_active: true }] : [{ workflow_id: schema.cluster_id, workflow_version: 1, is_active: true, definition_active: true, schema_json: schema }] }) });
  const context = await resolver({ calledNumber: "+14165550101", callSid });
  const controller = isolated("src/voice/sessionController.js", { "./workflowExtractor": {}, "./workflowReplyComposer": {} });
  const session = controller.handleCallStarted(callSid, { routingContext: context });
  return { controller, session, callSid };
}
test("greeting passes through READY_TO_SPEAK and completes without rejected transitions", async (t) => {
  const records = capture(t); const { controller: c, session: s, callSid } = await controllerSession(501);
  c.handleGreeting(callSid); assert.equal(s.state, STATES.READY_TO_SPEAK);
  assert.equal(c.prepareSpeech(callSid), true); assert.equal(c.handleSpeak(callSid), true);
  assert.equal(s.state, STATES.SPEAKING); assert.equal(s.isSpeaking, true);
  assert.equal(c.handleSpeechComplete(callSid), true); assert.equal(s.state, STATES.AWAITING_INPUT); assert.equal(s.isSpeaking, false);
  assert.equal(c.handleSpeechComplete(callSid), false);
  assert.ok(!JSON.stringify(records).includes("STATE_REJECTED")); c.handleCallEnded(callSid);
});
test("prepared local repairs remain valid while direct LISTENING to SPEAKING stays rejected", async () => {
  const { controller: c, session: s, callSid } = await controllerSession(502);
  c.handleGreeting(callSid); c.handleSpeechFailed(callSid); assert.equal(s.state, STATES.LISTENING);
  assert.equal(canTransition(STATES.LISTENING, STATES.SPEAKING), false);
  assert.equal(c.handleSpeak(callSid), false); assert.equal(s.isSpeaking, false);
  for (const state of [STATES.LISTENING, STATES.AWAITING_END_OF_TURN, STATES.AWAITING_INPUT]) {
    s.state = state; assert.equal(c.prepareSpeech(callSid), true); assert.equal(s.state, STATES.READY_TO_SPEAK);
    assert.equal(c.handleSpeak(callSid), true); assert.equal(c.handleSpeechInterrupted(callSid), true);
    assert.equal(s.state, STATES.LISTENING); assert.equal(s.isSpeaking, false);
  }
  c.handleCallEnded(callSid);
});
test("TTS failure recovers listening; terminal and unprepared sessions cannot send speech", async () => {
  const { controller: c, session: s, callSid } = await controllerSession(503);
  c.handleGreeting(callSid); assert.equal(c.handleSpeechFailed(callSid), true); assert.equal(s.state, STATES.LISTENING);
  c.prepareSpeech(callSid); c.handleSpeak(callSid); assert.equal(c.handleSpeechFailed(callSid), false);
  c.handleCallEnded(callSid); assert.equal(c.prepareSpeech(callSid), false); assert.equal(c.handleSpeak(callSid), false);
  assert.equal(store.getSession(callSid), undefined);
});
