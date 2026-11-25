"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

test("unused archiver dependency stays out of the marketplace runtime", () => {
  assert.equal(Object.hasOwn(manifest.dependencies || {}, "archiver"), false);
});

test("Google Speech-to-Text remains an explicit runtime dependency", () => {
  assert.equal(typeof manifest.dependencies?.["@google-cloud/speech"], "string");
  const source = fs.readFileSync(path.join(__dirname, "..", "src/brain/utils/sttGoogle.js"), "utf8");
  assert.match(source, /require\(["']@google-cloud\/speech["']\)/);
});
