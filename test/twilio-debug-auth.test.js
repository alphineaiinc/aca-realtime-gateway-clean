"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");

// Exercise the actual root middleware and route without importing index.js:
// importing the application starts services and opens a database connection.
const source = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8");
function section(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing source section: ${start}`);
  return source.slice(first, last);
}

test("Twilio diagnostics only reads transcripts for authenticated admins", async (t) => {
  const app = express();
  const secret = "aca-062-synthetic-test-secret";
  const debug = {
    updatedAt: "2026-01-01T00:00:00.000Z",
    events: [{ event: "dispatch_turn", callSid: "CA_SYNTHETIC", text: "synthetic caller text" }],
  };
  let reads = 0;
  vm.runInNewContext(
    section("function requireAdmin(req, res, next) {", "function createRateLimiter(") +
      "\n" + section('app.get("/monitor/twilio-debug",', 'console.log("✅ Mounted /monitor/twilio-debug");'),
    {
      app,
      jwt,
      process: { env: { JWT_SECRET: secret } },
      getTwilioDebugState() { reads += 1; return debug; },
    }
  );

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}/monitor/twilio-debug`;
  const sign = (payload, options = {}) => jwt.sign(payload, secret, options);
  const denied = [
    ["missing credentials", undefined, 401],
    ["wrong authorization scheme", "Basic synthetic", 401],
    ["malformed token", "Bearer not-a-jwt", 401],
    ["forged admin token", `Bearer ${jwt.sign({ role: "admin" }, "wrong-test-secret")}`, 401],
    ["expired admin token", `Bearer ${sign({ role: "admin" }, { expiresIn: -1 })}`, 401],
    ["valid non-admin token", `Bearer ${sign({ role: "partner" })}`, 403],
    ["valid token without role", `Bearer ${sign({ sub: "synthetic-user" })}`, 403],
  ];

  for (const [name, authorization, status] of denied) {
    await t.test(name, async () => {
      const response = await fetch(url, { headers: authorization ? { authorization } : {} });
      assert.equal(response.status, status);
      const body = await response.json();
      assert.deepEqual(body, { ok: false, error: status === 403 ? "forbidden" : "unauthorized" });
      assert.equal(reads, 0, "Denied requests must not read the debug buffer");
    });
  }

  await t.test("valid admin retains diagnostics", async () => {
    const response = await fetch(url, { headers: { authorization: `Bearer ${sign({ role: "admin" })}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, debug });
    assert.equal(reads, 1);
  });
});
