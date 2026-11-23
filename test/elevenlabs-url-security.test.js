"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildElevenLabsTtsUrl, getElevenLabsRequestLimits } = require("../src/voice/elevenLabsUrl");

test("constructs fixed-origin ElevenLabs URL for supported formats", () => {
  for (const format of ["ulaw_8000", "mp3_44100_128"]) {
    const url = new URL(buildElevenLabsTtsUrl("21m00Tcm4TlvDq8ikWAM", format));
    assert.equal(url.origin, "https://api.elevenlabs.io");
    assert.equal(url.pathname, "/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM");
    assert.equal(url.searchParams.get("output_format"), format);
  }
});

test("rejects unsafe voice IDs before any outbound request", () => {
  for (const id of ["", "../admin", "x?redirect=https://evil.test", "x#fragment",
    "x/y", "x%2Fadmin", "x\\admin", "x\nHeader: evil", "a".repeat(65),
    null, {}, "http://127.0.0.1"]) {
    assert.throws(() => buildElevenLabsTtsUrl(id, "ulaw_8000"), TypeError);
  }
});

test("rejects unsupported output formats", () => {
  for (const format of ["", "mp3_44100_128&redirect=evil", "../x", "pcm_16000", null]) {
    assert.throws(() => buildElevenLabsTtsUrl("21m00Tcm4TlvDq8ikWAM", format), TypeError);
  }
});

test("authenticated ElevenLabs requests must not follow redirects", () => {
  const config = getElevenLabsRequestLimits();
  assert.equal(config.maxRedirects, 0);
  assert.ok(config.timeout > 0 && config.timeout <= 15000);
  assert.ok(config.maxContentLength > 0 && config.maxContentLength <= 20 * 1024 * 1024);
});
