// ==============================================
// [orchestrator]/routes/order.js
// Story 3.4 — Order Confirmation & TTS Response
// ==============================================
const express = require("express");
const router = express.Router();
const { createLogger } = require("../brain/utils/logger");
const logger = createLogger({ level: "info" });

const { detectAndExecuteIntent } = require("../brain/utils/intent_engine");
const { generateOrderConfirmation } = require("../brain/actions/order_confirm");

router.post("/intent", async (req, res) => {
  try {
    const { business_id, query } = req.body;

    if (!business_id || !query) {
      return res.status(400).json({ error: "Missing business_id or query." });
    }

    logger.info(`[OrderRoute] Processing intent for business_id=${business_id} query="${query}"`);

    // Step 1: Detect and execute intent (order_food, etc.)
    const result = await detectAndExecuteIntent(business_id, query);

    // Step 2: If it’s an order intent, handle confirmation + TTS
    if (result.intent === "order_food" && result.result?.success) {
      const orderData = {
        id: result.result.order_id,
        items: result.result.message
          .replace("Order placed for ", "")
          .split(",")
          .map(i => i.trim()),
      };

      const { confirmationText, audioUrl } = await generateOrderConfirmation(orderData);

      logger.info(`[OrderRoute] ✅ Order ${orderData.id} confirmed. Audio: ${audioUrl}`);

      return res.json({
        ok: true,
        intent: result.intent,
        confirmation: confirmationText,
        audio_url: audioUrl,
        order_id: orderData.id,
      });
    }

    // Step 3: For non-order intents, return as-is
    res.json(result);

  } catch (err) {
    logger.error(`[OrderRoute Error] ${err.message}`);
    res.status(500).json({ error: "Intent execution failed.", details: err.message });
  }
});

module.exports = router;
