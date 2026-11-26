"use strict";
// Process-local resource bounds. Fleet-wide admission belongs at the ingress.
const MAX_MESSAGE_BYTES = 16 * 1024;
function createStreamSecurity({ maxConnections = 256, maxPending = 32,
  startTimeoutMs = 10000, closeTimeoutMs = 1000, idleTimeoutMs = 30000,
  schedule = setTimeout, cancel = clearTimeout } = {}) {
  let connections = 0;
  let pending = 0;
  return function acquire(ws, onFailure = () => {}) {
    let released = false;
    let admitted = false;
    let failed = false;
    let timer;
    let forceTimer;
    const counted = connections < maxConnections && pending < maxPending;
    if (counted) { connections += 1; pending += 1; }
    function release() {
      if (released) return;
      released = true;
      cancel(timer); cancel(forceTimer);
      if (counted) { connections -= 1; if (!admitted) pending -= 1; }
    }
    function fail(code = 1008, reason = "Invalid stream") {
      if (failed || released) return;
      failed = true;
      cancel(timer);
      // Terminate peers that ignore the close handshake, keeping resources bounded.
      forceTimer = schedule(() => { ws.terminate?.(); release(); }, closeTimeoutMs);
      forceTimer.unref?.();
      try { onFailure(); } catch {}
      ws.close(code, reason);
    }
    ws.once("close", release);
    ws.on("error", () => fail(1011, "Stream error"));
    if (!counted) fail(1013, "Stream capacity reached");
    else {
      timer = schedule(() => fail(1008, "Start timeout"), startTimeoutMs);
      timer.unref?.();
    }
    function touch() {
      if (!admitted || failed || released) return;
      cancel(timer);
      timer = schedule(() => fail(1008, "Stream idle timeout"), idleTimeoutMs);
      timer.unref?.();
    }
    return {
      touch,
      get closed() { return failed || released; },
      fail,
      admit() {
        if (failed || released || admitted || !counted) return false;
        admitted = true; pending -= 1; touch(); return true;
      },
    };
  };
}
module.exports = { MAX_MESSAGE_BYTES, WS_OPTIONS: { maxPayload: 1024 * 1024, perMessageDeflate: false },
  createStreamSecurity, acquireStream: createStreamSecurity() };
