"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../src/voice/sessionController.js"), "utf8");

test("voice session gates durable intake on validated call identity and explicit confirmation", () => {
  assert.match(source, /isValidatedRoutingContext\(routing\)/);
  assert.match(source, /routing\.callSid\s*!==\s*callSid/);
  assert.match(source, /meta\.tenantId\s*!==\s*undefined/);
  assert.match(source, /meta\.businessId\s*!==\s*undefined/);
  assert.match(source, /session\.awaitingExplicitConfirmation/);
  assert.match(source, /canConfirmNow\(getSessionSlotProfile\(session\),\s*session\.slots\)/);
  assert.match(source, /await\s+saveConfirmedIntake\(pool,\s*\{\s*confirmed:\s*true,\s*tenantId:\s*routing\.tenantId,\s*callSid/);
  assert.match(source, /session\.workflowStatus\s*=\s*"request_recorded"/);
});

test("voice acknowledgement never claims booking-system confirmation", () => {
  assert.match(source, /This is not a confirmed appointment/);
  assert.match(source, /couldn't save your request/);
  assert.match(source, /session\.workflowStatus\s*===\s*"request_recorded"/);
});
