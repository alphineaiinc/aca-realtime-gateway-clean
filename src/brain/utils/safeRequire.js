"use strict";

/**
 * Root shim for Render runtime:
 * root index.js requires "./src/brain/utils/safeRequire"
 * but the real implementation may live under aca-orchestrator.
 * This shim preserves backwards compatibility without touching index.js.
 */
function fallbackSafeRequire(modPath, label) {
  try {
    return require(modPath);
  } catch (err) {
    const tag = label ? ` (${label})` : "";
    console.warn(`⚠️ safeRequire fallback could not load${tag}:`, modPath, "-", err && err.message ? err.message : String(err));
    return null;
  }
}

try {
  // Try local implementation first (if you later add it here)
  module.exports = require("./safeRequire.local");
} catch (e1) {
  try {
    // Most likely location in your repo
    module.exports = require("../../../aca-orchestrator/src/brain/utils/safeRequire");
  } catch (e2) {
    // Last resort: export a compatible function so code can keep running
    module.exports = { safeRequire: fallbackSafeRequire };
  }
}
