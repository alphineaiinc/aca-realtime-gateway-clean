"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { SpeechClient } = require("@google-cloud/speech");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

test("unused archiver dependency stays out of the marketplace runtime", () => {
  assert.equal(Object.hasOwn(manifest.dependencies || {}, "archiver"), false);
});

test("Google Speech-to-Text v8 remains explicitly installed and API-compatible", () => {
  assert.match(manifest.dependencies?.["@google-cloud/speech"] || "", /^\^8\./);
  assert.equal(typeof SpeechClient, "function");
  assert.equal(typeof SpeechClient.prototype.streamingRecognize, "function");
  assert.equal(typeof SpeechClient.prototype.recognize, "function");
  const source = fs.readFileSync(path.join(__dirname, "..", "src/brain/utils/sttGoogle.js"), "utf8");
  assert.match(source, /require\(["']@google-cloud\/speech["']\)/);
  assert.match(source, /\.streamingRecognize\(request\)/);
});
