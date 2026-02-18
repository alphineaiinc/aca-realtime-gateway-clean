"use strict";

/**
 * Root shim for Render/runtime.
 * Goal: export { safeRequire } with the same signature your code expects,
 * but prefer orchestrator's implementation when present.
 */

let warned = false;

function fallbackSafeRequire(modPath, label) {
  try {
    return require(modPath);
  } catch (err) {
    // Only warn once to avoid log spam
    if (!warned) {
      warned = true;
      const tag = label ? ` (${label})` : "";
      console.warn(
        `⚠️ safeRequire fallback active${tag}. Some optional modules may be absent; continuing.`
      );
    }
    return null;
  }
}

try {
  // Prefer orchestrator implementation (most accurate)
  module.exports = require("../../../aca-orchestrator/src/brain/utils/safeRequire");
} catch (e) {
  // Fallback: export compatible function
  module.exports = { safeRequire: fallbackSafeRequire };
}
