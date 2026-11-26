"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { SpeechClient } = require("@google-cloud/speech");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("unused archiver dependency stays out of the marketplace runtime", () => {
  assert.equal(Object.hasOwn(manifest.dependencies || {}, "archiver"), false);
});

test("Google Speech-To-Text v8 remains explicitly installed and API-compatible", () => {
  assert.match(manifest.dependencies?.["@google-cloud/speech"] || "", /^\^8\./);
  assert.equal(typeof SpeechClient, "function");
  assert.equal(typeof SpeechClient.prototype.streamingRecognize, "function");
  assert.equal(typeof SpeechClient.prototype.recognize, "function");
  const source = fs.readFileSync(path.join(root, "src/brain/utils/sttGoogle.js"), "utf8");
  assert.match(source, /require\(["']@google-cloud\/speech["']\)/);
  assert.match(source, /\.streamingRecognize\(request\)/);
});

test("marketplace archive inputs include the source and tests used by acceptance checks", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/marketplace-sdk-resolution.yml"), "utf8");
  for (const required of [
    "src/marketplace",
    "src/brain/utils/sttGoogle.js",
    "test/marketplace-mcp-authenticated.test.js",
    "test/marketplace-business-tools.test.js",
    "test/marketplace-mail-compat.test.js",
    "test/marketplace-dependency-surface.test.js"
  ]) assert.ok(workflow.includes(required), "missing archive input: " + required);
});
