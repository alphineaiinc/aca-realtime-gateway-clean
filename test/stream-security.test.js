"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createStreamSecurity } = require("../src/voice/streamSecurity");
function clock() {
  let now = 0; const jobs = new Map();
  return { schedule(fn, ms) { const id = {}; jobs.set(id, { at: now + ms, fn }); return id; },
    cancel(id) { jobs.delete(id); },
    advance(ms) { now += ms; for (const [id, job] of [...jobs]) if (job.at <= now && jobs.delete(id)) job.fn(); } };
}
class Peer extends EventEmitter {
  constructor(ignoreClose = false) { super(); this.ignoreClose = ignoreClose; }
  close(code) { this.code = code; if (!this.ignoreClose) this.emit("close"); }
  terminate() { this.terminated = true; this.emit("close"); }
}
test("pending and total connection caps release capacity exactly once", () => {
  const c = clock(); const acquire = createStreamSecurity({ ...c, maxConnections: 2, maxPending: 1 });
  const a = new Peer(); const first = acquire(a);
  const denied = new Peer(); acquire(denied); assert.equal(denied.code, 1013);
  assert.equal(first.admit(), true); assert.equal(first.admit(), false);
  const b = new Peer(); const second = acquire(b);
  const totalDenied = new Peer(); acquire(totalDenied); assert.equal(totalDenied.code, 1013);
  a.emit("close"); a.emit("close");
  const pendingDenied = new Peer(); acquire(pendingDenied); assert.equal(pendingDenied.code, 1013);
  second.admit(); const replacement = new Peer(); const next = acquire(replacement);
  assert.equal(replacement.code, undefined); next.fail(); b.emit("close");
});
test("connection timeout cannot be prolonged by unauthenticated traffic", () => {
  const c = clock(); let cleaned = 0;
  const acquire = createStreamSecurity({ ...c, startTimeoutMs: 100, closeTimeoutMs: 10 });
  const peer = new Peer(true); const guard = acquire(peer, () => { cleaned += 1; });
  c.advance(90); guard.touch(); c.advance(10);
  assert.equal(peer.code, 1008); assert.equal(cleaned, 1); assert.equal(guard.admit(), false);
  c.advance(10); assert.equal(peer.terminated, true); assert.equal(guard.closed, true);
  guard.fail(); assert.equal(cleaned, 1);
});
test("authorized idle connections time out and activity refreshes only the idle timer", () => {
  const c = clock(); const acquire = createStreamSecurity({ ...c, idleTimeoutMs: 50 });
  const peer = new Peer(); const guard = acquire(peer); guard.admit();
  c.advance(40); guard.touch(); c.advance(40); assert.equal(peer.code, undefined);
  c.advance(10); assert.equal(peer.code, 1008); assert.equal(guard.closed, true);
});
test("socket errors trigger failure cleanup and force-close nonresponsive peers", () => {
  const c = clock(); let cleaned = 0;
  const acquire = createStreamSecurity({ ...c, closeTimeoutMs: 10 });
  const peer = new Peer(true); const guard = acquire(peer, () => { cleaned += 1; }); guard.admit();
  peer.emit("error", new Error("synthetic network error"));
  assert.equal(peer.code, 1011); assert.equal(cleaned, 1);
  c.advance(10); assert.equal(peer.terminated, true);
});
