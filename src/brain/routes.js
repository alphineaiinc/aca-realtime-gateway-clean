// ================================
// src/brain/routes.js
// Core Knowledge Brain API Routes
// Story 3.3 — Intent-Driven Order Execution
// Safe-load version (Story 4.0 patch, refined guard)
// ================================
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const express = require("express");
const router = express.Router();

// --- Early guard: ensure Express never crashes if analytics import fails later ---
const originalUse = router.use.bind(router);
router.use = function (...args) {
  try {
    // if only a path is provided or handler is invalid, skip instead of throwing
    if (args.length < 2 || !args[1] || typeof args[1] !== "function") {
      console.warn("⚠️  Skipping router.use call missing or invalid handler:", args[0]);
      return router;
    }
    return originalUse(...args);
  } catch (err) {
    console.warn("⚠️  router.use guard caught error:", err.message);
    return router;
  }
};

const { detectAndExecuteIntent } = require("./utils/intent_engine");
const { logger, attachRequestId } = require("./utils/logger");
const { validateJson } = require("./middleware/security");
const {
  health,
  activate,
  deactivate,
  diagnostics,
  train,
} = require("./controllers/brainController");

const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const axios = require("axios");
const { getOrCreateEmbeddingSpace } = require("./utils/embeddingManager");
const { getPersonality } = require("./utils/personalityManager");

// --- Optional Analytics route (safe import) ---
let analyticsRoute;
try {
  analyticsRoute = require("./analytics");
  if (!analyticsRoute || typeof analyticsRoute.use !== "function") {
    console.warn("⚠️ analyticsRoute invalid, using stub router");
    const stub = express.Router();
    stub.get("/", (req, res) =>
      res.json({ ok: true, stub: true, reason: "invalid analyticsRoute" })
    );
    analyticsRoute = stub;
  }
} catch (e) {
  console.warn("⚠️ analyticsRoute missing, using stub router");
  const stub = express.Router();
  stub.get("/", (req, res) =>
    res.json({ ok: true, stub: true, reason: "analyticsRoute missing" })
  );
  analyticsRoute = stub;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const LOG_PATH = path.join(__dirname, "logs", "response_tuning.log");

// ensure log dir
try {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
} catch (e) {
  console.warn("⚠️ log dir check failed:", e.message);
}

router.use(attachRequestId);

// ---------- Health & Lifecycle ----------
router.get("/health", health);
router.post("/activate", express.json(), activate);
router.post("/deactivate", express.json(), deactivate);
router.get("/diagnostics", diagnostics);
router.post("/train", express.json(), train);

router.post(
  "/_noop",
  express.json(),
  (err, req, res, next) => next(err),
  validateJson(),
  (req, res) => res.status(204).end()
);

// ---------- Story 3.3 — Order Intent ----------
router.post("/order/intent", express.json(), async (req, res) => {
  try {
    const { business_id, query } = req.body;
    console.log("🛰️ [DEBUG] /order/intent:", { business_id, query });
    const result = await detectAndExecuteIntent(business_id, query);
    res.json(result);
  } catch (err) {
    console.error("❌ [ERROR] /order/intent:", err);
    res
      .status(500)
      .json({ error: "Intent execution failed", details: err.message });
  }
});

// ---------- /brain/query ----------
router.post("/query", express.json(), async (req, res) => {
  console.log("🟡 Story 2.9 adaptive tuning layer active");
  try {
    const businessId = req.body.business_id;
    const query = req.body.query?.trim();
    if (!businessId || !query)
      return res.status(400).json({ error: "Missing business_id or query" });

    const embeddingSpaceId = await getOrCreateEmbeddingSpace(businessId);
    const embedResponse = await axios.post(
      "https://api.openai.com/v1/embeddings",
      { model: "text-embedding-3-small", input: query },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );

    const vector = embedResponse.data.data[0].embedding;
    const vectorString = `[${vector.join(",")}]`;

    const { rows } = await pool.query(
      `
      SELECT id, question, answer,
             1 - (embedding <=> $2::vector) AS similarity
        FROM kb_entries
       WHERE embedding_space_id = $1
    ORDER BY embedding <=> $2::vector
       LIMIT 3
      `,
      [embeddingSpaceId, vectorString]
    );

    const persona = await getPersonality(businessId);
    let tunedResponse = null;
    let confidence = 0;

    if (rows.length > 0) {
      const top = rows[0];
      confidence = parseFloat(top.similarity || 0).toFixed(2);
      tunedResponse = top.answer;

      if (confidence < 0.88) {
        const adaptivePrompt = `
You are the AI call assistant for business ${businessId}.
Caller asked: "${query}"
Closest KB answer: "${top.answer}"
Similarity score: ${confidence}
Tone: ${persona?.tone || "friendly and conversational"}.
Rephrase or expand this answer naturally for a phone call, preserving correctness.
If unsure, politely indicate you’ll confirm or connect the caller. Keep it concise and warm.
        `;
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are a helpful and polite voice AI assistant.",
              },
              { role: "user", content: adaptivePrompt },
            ],
            max_tokens: 120,
            temperature: 0.8,
          });
          tunedResponse =
            completion.choices?.[0]?.message?.content?.trim() || top.answer;
        } catch (gptErr) {
          console.error("⚠️ Adaptive tuning GPT error:", gptErr.message);
        }
      }
    } else {
      tunedResponse =
        "I’m not sure about that. Would you like me to connect you with someone from our team?";
    }

    await logAdaptiveResponse(query, tunedResponse, confidence);

    try {
      await pool.query(
        `INSERT INTO confidence_metrics (business_id, query, confidence)
         VALUES ($1, $2, $3)`,
        [businessId, query, confidence]
      );
      logger.info(
        `📊 Confidence logged | biz=${businessId} | confidence=${confidence}`
      );
    } catch (e) {
      logger.error(`confidence_metrics insert failed: ${e.message}`);
    }

    try {
      await pool.query(
        `INSERT INTO query_history (business_id, query, confidence, tuned_response)
         VALUES ($1,$2,$3,$4)`,
        [businessId, query, confidence, tunedResponse]
      );
    } catch (e) {
      logger.error(`query_history insert failed: ${e.message}`);
    }

    res.json({
      query,
      matches: rows,
      personality: persona,
      confidence,
      tuned_response: tunedResponse,
    });
  } catch (err) {
    console.error("❌ /brain/query error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------- Utility: Adaptive Response Logger ----------
async function logAdaptiveResponse(query, response, confidence) {
  try {
    const logEntry = `[${new Date().toISOString()}] confidence=${confidence} | query="${query}" | response="${response}"\n`;
    await fs.promises.appendFile(LOG_PATH, logEntry, "utf8");
  } catch (err) {
    console.error("⚠️ Failed to write adaptive log:", err.message);
  }
}

// ---------- Story 2.12 — Analytics Summary API Mount ----------

// ✅ PATCH START — prevent crash if analyticsRoute is undefined or invalid
if (!analyticsRoute || typeof analyticsRoute !== "function") {
  console.warn(
    "⚠️ analyticsRoute is missing or invalid. Using stub router to avoid crash."
  );
  const stub = express.Router();
  stub.get("/", (req, res) => {
    res.json({ ok: true, stub: true, message: "Analytics route not available" });
  });
  analyticsRoute = stub;
}
// ✅ PATCH END

router.use("/analytics", analyticsRoute);

// ---------- Export router ----------
module.exports = router;
