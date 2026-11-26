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
    assert.equal(config.headers.Authorization, undefined);
    assert.equal(config.maxRedirects, 0);
    assert.equal(config.beforeRedirect, undefined);
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

test("ElevenLabs rejects redirect responses without retrying at redirected origin", async () => {
  const originalLoad = Module._load;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldEleven = process.env.ELEVENLABS_API_KEY;
  let calls = 0;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ELEVENLABS_API_KEY = "test-eleven-key";
  try {
    Module._load = function(request, parent, isMain) {
      if (request === "axios") return { post: async (_url, _body, config) => {
        calls += 1;
        assert.equal(config.maxRedirects, 0);
        const err = new Error("Request failed with status code 302");
        err.response = { status: 302, statusText: "Found", data: Buffer.alloc(0),
          headers: { location: "http://127.0.0.1/steal" } };
        throw err;
      }};
      if (request === "openai") return class FakeOpenAI {};
      if (request.endsWith("/voiceProfileLoader")) return { getTenantVoiceProfile: async () => null };
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[require.resolve("../tts")];
    const { synthesizeSpeech } = require("../tts");
    await assert.rejects(() => synthesizeSpeech("hello", "en-US", {
      provider: "elevenlabs", useFillers: false,
    }), (err) => err.code === "TTS_PROVIDER_ERROR" && err.provider === "elevenlabs" && err.statusCode === 302);
    assert.equal(calls, 1, "redirect response must not cause a second authenticated request");
  } finally {
    Module._load = originalLoad;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = oldEleven;
    delete require.cache[require.resolve("../tts")];
  }
});

test("ElevenLabs rejects unsupported output format before outbound HTTP", async () => {
  const originalLoad = Module._load;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldEleven = process.env.ELEVENLABS_API_KEY;
  let calls = 0;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ELEVENLABS_API_KEY = "test-eleven-key";
  try {
    Module._load = function(request, parent, isMain) {
      if (request === "axios") return { post: async () => { calls++; throw new Error("Unexpected network call"); } };
      if (request === "openai") return class FakeOpenAI {};
      if (request.endsWith("/voiceProfileLoader")) return { getTenantVoiceProfile: async () => null };
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[require.resolve("../tts")];
    const { synthesizeSpeech } = require("../tts");
    await assert.rejects(() => synthesizeSpeech("hello", "en-US", {
      provider: "elevenlabs", outputFormat: "mp3_44100_128&redirect=http://127.0.0.1",
      useFillers: false,
    }), TypeError);
    assert.equal(calls, 0);
  } finally {
    Module._load = originalLoad;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = oldEleven;
    delete require.cache[require.resolve("../tts")];
  }
});

test("ElevenLabs valid MP3 synthesis uses expected MIME and no redirect", async () => {
  const originalLoad = Module._load;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldEleven = process.env.ELEVENLABS_API_KEY;
  const requests = [];
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ELEVENLABS_API_KEY = "test-eleven-key";
  try {
    Module._load = function(request, parent, isMain) {
      if (request === "axios") return { post: async (...args) => {
        requests.push(args);
        return { data: Buffer.from([0x49, 0x44, 0x33]) };
      }};
      if (request === "openai") return class FakeOpenAI {};
      if (request.endsWith("/voiceProfileLoader")) return { getTenantVoiceProfile: async () => null };
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[require.resolve("../tts")];
    const { synthesizeSpeech } = require("../tts");
    const data = await synthesizeSpeech("bonjour", "fr-FR", {
      provider: "elevenlabs", outputFormat: "mp3_44100_128", useFillers: false,
    });
    assert.deepEqual(data, Buffer.from([0x49, 0x44, 0x33]));
    assert.equal(requests.length, 1);
    const [url, payload, config] = requests[0];
    assert.equal(new URL(url).origin, "https://api.elevenlabs.io");
    assert.equal(new URL(url).searchParams.get("output_format"), "mp3_44100_128");
    assert.equal(config.headers.Accept, "audio/mpeg");
    assert.equal(config.maxRedirects, 0);
    assert.equal(payload.model_id, "eleven_multilingual_v2");
  } finally {
    Module._load = originalLoad;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = oldEleven;
    delete require.cache[require.resolve("../tts")];
  }
});

test("ElevenLabs upstream failure rejects safely without retrying", async () => {
  const originalLoad = Module._load;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldEleven = process.env.ELEVENLABS_API_KEY;
  let calls = 0;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ELEVENLABS_API_KEY = "test-eleven-key";
  try {
    Module._load = function(request, parent, isMain) {
      if (request === "axios") return { post: async (_url, _body, config) => {
        calls++;
        assert.equal(config.maxRedirects, 0);
        const err = new Error("upstream unavailable");
        err.code = "ECONNRESET";
        throw err;
      }};
      if (request === "openai") return class FakeOpenAI {};
      if (request.endsWith("/voiceProfileLoader")) return { getTenantVoiceProfile: async () => null };
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[require.resolve("../tts")];
    const { synthesizeSpeech } = require("../tts");
    await assert.rejects(() => synthesizeSpeech("hello", "en-US", {
      provider: "elevenlabs", useFillers: false,
    }), /ElevenLabs TTS failed \(ECONNRESET\)/);
    assert.equal(calls, 1);
  } finally {
    Module._load = originalLoad;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = oldEleven;
    delete require.cache[require.resolve("../tts")];
  }
});

test("OpenAI provider remains usable independently of ElevenLabs credentials", async () => {
  const originalLoad = Module._load;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldEleven = process.env.ELEVENLABS_API_KEY;
  let openAiCalls = 0;
  let axiosCalls = 0;
  process.env.OPENAI_API_KEY = "test-openai-key";
  delete process.env.ELEVENLABS_API_KEY;
  try {
    Module._load = function(request, parent, isMain) {
      if (request === "axios") return { post: async () => { axiosCalls++; throw new Error("unexpected ElevenLabs call"); } };
      if (request === "openai") return class FakeOpenAI {
        constructor() {
          this.audio = { speech: { create: async (request) => {
            openAiCalls++;
            assert.equal(request.response_format, "mp3");
            return { arrayBuffer: async () => Uint8Array.from([0x49, 0x44, 0x33]).buffer };
          }}};
        }
      };
      if (request.endsWith("/voiceProfileLoader")) return { getTenantVoiceProfile: async () => null };
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[require.resolve("../tts")];
    const { synthesizeSpeech } = require("../tts");
    const data = await synthesizeSpeech("hello", "en-US", {
      provider: "openai", outputFormat: "mp3_44100_128", useFillers: false,
    });
    assert.deepEqual(data, Buffer.from([0x49, 0x44, 0x33]));
    assert.equal(openAiCalls, 1);
    assert.equal(axiosCalls, 0);
  } finally {
    Module._load = originalLoad;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = oldEleven;
    delete require.cache[require.resolve("../tts")];
  }
});


test("ElevenLabs never exposes upstream response bodies or API key in errors", async () => {
  const originalLoad = Module._load;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldEleven = process.env.ELEVENLABS_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ELEVENLABS_API_KEY = "test-eleven-key";
  const errors = [];
  const originalError = console.error;
  try {
    console.error = (...args) => errors.push(args.map(String).join(" "));
    Module._load = function(request, parent, isMain) {
      if (request === "axios") return { post: async () => {
        const err = new Error("test-eleven-key leaked in message");
        err.response = { status: 401, statusText: "test-eleven-key", data: "test-eleven-key confidential caller text" };
        throw err;
      }};
      if (request === "openai") return class FakeOpenAI {};
      if (request.endsWith("/voiceProfileLoader")) return { getTenantVoiceProfile: async () => null };
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[require.resolve("../tts")];
    const { synthesizeSpeech } = require("../tts");
    await assert.rejects(() => synthesizeSpeech("hello", "en-US", {
      provider: "elevenlabs", useFillers: false,
    }), err => err.message === "Speech synthesis unavailable" && err.code === "TTS_PROVIDER_ERROR" && err.statusCode === 401);
    assert.ok(!errors.join(" ").includes("test-eleven-key"));
    assert.ok(!errors.join(" ").includes("confidential caller text"));
  } finally {
    console.error = originalError;
    Module._load = originalLoad;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = oldEleven;
    delete require.cache[require.resolve("../tts")];
  }
});

test("ElevenLabs diagnostics omit credential length and untrusted error code", async () => {
  const originalLoad = Module._load;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldEleven = process.env.ELEVENLABS_API_KEY;
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  const errors = [];
  const secret = "test-eleven-key-sensitive";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ELEVENLABS_API_KEY = secret;
  try {
    console.log = (...args) => logs.push(args.map(String).join(" "));
    console.error = (...args) => errors.push(args.map(String).join(" "));
    Module._load = function(request, parent, isMain) {
      if (request === "axios") return { post: async () => {
        const err = new Error("upstream failure");
        err.code = "SENSITIVE_ERROR_CODE_" + secret;
        throw err;
      }};
      if (request === "openai") return class FakeOpenAI {};
      if (request.endsWith("/voiceProfileLoader")) return { getTenantVoiceProfile: async () => null };
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[require.resolve("../tts")];
    const { synthesizeSpeech } = require("../tts");
    await assert.rejects(() => synthesizeSpeech("hello", "en-US", {
      provider: "elevenlabs", useFillers: false,
    }), (err) => err.message === "Speech synthesis unavailable" && err.code === "TTS_PROVIDER_ERROR");
    const diagnostic = logs.concat(errors).join(" ");
    assert.ok(!diagnostic.includes(secret), "credential bytes must not appear in diagnostics");
    assert.ok(!diagnostic.includes("SENSITIVE_ERROR_CODE"), "untrusted transport code must not be logged");
    assert.ok(!diagnostic.includes("key length"), "credential length must not be logged");
    assert.ok(!diagnostic.includes("keyLength"), "credential length metadata must not be logged");
  } finally {
    console.log = originalLog;
    console.error = originalError;
    Module._load = originalLoad;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = oldEleven;
    delete require.cache[require.resolve("../tts")];
  }
});
