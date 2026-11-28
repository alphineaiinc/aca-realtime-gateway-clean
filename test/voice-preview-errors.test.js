"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const util = require("node:util");
const express = require("express");
const jwt = require("jsonwebtoken");
const { isolated, capture } = require("./helpers/isolated.cjs");
for (const provider of ["openai", "elevenlabs"]) test(`${provider} error remains safe through the actual preview route`, async (t) => {
  const logs = capture(t); const canary = "PRIVATE_PROVIDER_BODY_92716";
  const error = () => Object.assign(new Error(canary), { status: 502, statusText: canary, response: { status: 502, statusText: canary, data: { transcript: canary, apiKey: canary } } });
  const tts = isolated("tts.js", {
    openai: class { constructor() { this.audio = { speech: { create: async () => { throw error(); } } }; } },
    axios: { post: async () => { throw error(); } },
    "./src/brain/utils/voiceProfileLoader": { getTenantVoiceProfile: async () => null },
  }, { OPENAI_API_KEY: "synthetic", ELEVENLABS_API_KEY: "synthetic", TTS_PROVIDER: provider });
  await assert.rejects(tts.synthesizeSpeech("Synthetic request", "en-US"), (e) => {
    assert.equal(e.code, "TTS_PROVIDER_ERROR"); assert.equal(e.message, "Speech synthesis unavailable");
    assert.equal(e.cause, undefined); assert.ok(!util.inspect(e).includes(canary)); return true;
  });
  const router = isolated("src/routes/voice.js", { "../db/pool": {}, "../../tts": tts }, { JWT_SECRET: "synthetic-preview-secret" });
  const app = express(); app.use("/api/voice", router);
  const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/voice/preview`, { method: "POST", headers: {
    "content-type": "application/json", authorization: `Bearer ${jwt.sign({ tenant_id: 7 }, "synthetic-preview-secret")}` }, body: JSON.stringify({ text: canary }) });
  assert.equal(response.status, 500); assert.ok(!(await response.text()).includes(canary));
  const output = logs.map((record) => util.format(...record.args)).join("\n"); assert.ok(!output.includes(canary));
});
