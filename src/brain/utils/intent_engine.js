// ========================================================
// src/brain/utils/intent_engine.js
// Story 3.3 — Connect Root Brain to Orchestrator Order Executor
// ========================================================

// --- Base intent detection (Story 3.1) ---
async function detectIntent(text) {
  const lower = text.toLowerCase();

  if (
    lower.includes("order") ||
    lower.includes("coffee") ||
    lower.includes("latte") ||
    lower.includes("cappuccino") ||
    lower.includes("muffin") ||
    lower.includes("tea") ||
    lower.includes("sandwich")
  ) {
    return { intent: "order_food", source: "rule" };
  }

  return { intent: "unknown", source: "rule" };
}

// --- Import the orchestrator's executor ---
const { executeOrderIntent } = require("../../../aca-orchestrator/src/brain/actions/order_executor");

// --- Wrapper: detect + execute ---
async function detectAndExecuteIntent(business_id, text) {
  const detected = await detectIntent(text);

  if (detected.intent === "order_food") {
    const result = await executeOrderIntent(business_id, text);
    return { ...detected, result };
  }

  return detected;
}

// --- Export both functions clearly ---
module.exports = {
  detectIntent,
  detectAndExecuteIntent,
};
