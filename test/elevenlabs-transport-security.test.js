"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

test("ElevenLabs synthesis sends credentials only to fixed origin with redirects disabled", async () => {
  const originalLoad = Module._load;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldEleven = process.env.ELEVENLABS_API_KEY;
  const calls = [];
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ELEVENLABS_API_KEY = "test-eleven-key";
  try {
    Module._load = function(request, parent, isMain) {
      if (request === "axios") return { post: async (...args) => {
        calls.push(args);
        return { data: Buffer.from([1, 2, 3]) };
      }};
      if (request === "openai") return class FakeOpenAI {};
      if (request.endsWith("/voiceProfileLoader")) return { getTenantVoiceProfile: async () => null };
      return originalLoad.apply(this, arguments);
    };
    const { synthesizeSpeech } = require("../tts");
    const data = await synthesizeSpeech("hello", "en-US", {
      provider: "elevenlabs", outputFormat: "ulaw_8000", useFillers: false,
    });
    assert.deepEqual(data, Buffer.from([1, 2, 3]));
    assert.equal(calls.length, 1);
    const [url, , config] = calls[0];
    assert.equal(new URL(url).origin, "https://api.elevenlabs.io");
    assert.equal(config.headers["xi-api-key"], "test-eleven-key");
    assert.equal(config.maxRedirects, 0);
    assert.ok(config.timeout > 0);
    await assert.rejects(() => synthesizeSpeech("hello", "en-US", {
      provider: "elevenlabs", explicitVoiceId: "http://127.0.0.1", useFillers: false,
    }), TypeError);
    assert.equal(calls.length, 1, "unsafe voice ID must not trigger an outbound request");
  } finally {
    Module._load = originalLoad;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = oldEleven;
    delete require.cache[require.resolve("../tts")];
  }
});
