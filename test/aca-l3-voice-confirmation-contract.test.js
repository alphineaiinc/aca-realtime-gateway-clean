"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../src/voice/sessionController.js"), "utf8");
test("voice session explicitly gates durable intake on a confirmation response", () => {
  assert.match(source, /if \(session\.awaitingExplicitConfirmation\)/);
  assert.match(source, /identityMatches/);
  assert.match(source, /getMissingRequiredSlots\(session\.businessType/);
  assert.match(source, /await saveConfirmedIntake\(pool,/);
  assert.match(source, /confirmed: true, tenantId: routing\.tenantId, callSid/);
  assert.match(source, /session\.workflowStatus = "request_recorded"/);
});
test("voice acknowledgement never claims booking-system confirmation", () => {
  assert.match(source, /This is not a confirmed appointment/);
  assert.match(source, /couldn't save your request/);
  assert.match(source, /session\.workflowStatus === "request_recorded"/);
});
