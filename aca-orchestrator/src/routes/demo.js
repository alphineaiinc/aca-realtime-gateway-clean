// src/routes/demo.js
// -----------------------------------------------------------------------------
// Story 11.1 — Unified Analytics Event Collector Integration (Demo Endpoint)
// -----------------------------------------------------------------------------
// Purpose: provide a safe public demo endpoint for ChatGPT Marketplace testing
// and simultaneously log demo activity into analytics_events + local audit log.
// -----------------------------------------------------------------------------

const express = require("express");
const router = express.Router();
const { recordEvent } = require("../analytics/eventCollector");

// Default sandbox tenant for demo
const SANDBOX_TENANT_ID = Number(process.env.SANDBOX_TENANT_ID || 9999);

// GET /api/demo?lang=xx-YY
router.get("/", async (req, res) => {
  try {
    const lang = (req.query.lang || "en-US").toString();

    const greetings = {
      "en-US": "Hello from Alphine AI – the Automated Call Attender demo is live.",
      "ta-IN": "வணக்கம்! Alphine AI – தன்னியக்க அழைப்பு உதவியாளர் டெமோ இயங்குகிறது.",
      "hi-IN": "नमस्ते! Alphine AI – स्वचालित कॉल सहायक डेमो सक्रिय है।",
      "fr-FR": "Bonjour ! La démo d'Alphine AI – Attendant Automatique est en ligne.",
      "ar-AE": "مرحبًا! عرض Alphine AI للمجيب الآلي يعمل الآن."
    };
    const message = greetings[lang] || greetings["en-US"];

    // send response to user
    res.json({ ok: true, message, lang });

    // log analytics event asynchronously
    recordEvent({
      tenant_id: SANDBOX_TENANT_ID,
      event_type: "DEMO_CALL",
      quantity: 1,
      unit: "hit",
      meta: { lang, user_agent: req.headers["user-agent"] || "" }
    });
  } catch (err) {
    console.error("❌ /api/demo error:", err);
    res.status(500).json({ ok: false, error: "demo_failed" });
  }
});

module.exports = router;
