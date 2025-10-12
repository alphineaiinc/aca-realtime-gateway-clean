// ===============================================
// src/routes/brain.js
// Story 2.9 — Adaptive Response Tuning for ACA
// ===============================================
const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const pool = require("../db/pool");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log("🔥 Story 2.9 adaptive router executing");


// ---------- Logging setup ----------
const LOG_PATH = path.join(__dirname, "logs", "response_tuning.log");
try {
  const logDir = path.dirname(LOG_PATH);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
} catch (e) {
  console.warn("⚠️ Log dir check failed:", e.message);
}

// ---------- /brain/query ----------
router.post("/query", async (req, res) => {
  console.log("🟡 Story 2.9 adaptive tuning layer active");

  const { business_id, query, top_k = 3 } = req.body;
  if (!business_id || !query)
    return res.status(400).json({ error: "business_id and query required" });

  try {
    // 1️⃣ Create embedding for the incoming query
    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const vector = emb.data[0].embedding;
    const vectorLiteral = "[" + vector.join(",") + "]";

    // 2️⃣ Query Postgres using cosine distance
    const result = await pool.query(
      `
      SELECT id, question, answer,
             1 - (embedding <=> $1::vector) AS similarity
        FROM kb_entries
       WHERE business_id = $2
    ORDER BY embedding <=> $1::vector
       LIMIT $3;
      `,
      [vectorLiteral, business_id, top_k]
    );

    const rows = result.rows;
    let tunedResponse = null;
    let confidence = 0;

    // 3️⃣ Adaptive Response Tuning
    if (rows.length > 0) {
      const top = rows[0];
      confidence = parseFloat(top.similarity || 0).toFixed(2);
      tunedResponse = top.answer;

      if (confidence < 0.88) {
        const adaptivePrompt = `
Caller asked: "${query}"
Closest KB answer (candidate): "${top.answer}"
Similarity score: ${confidence}

Rewrite this answer naturally for a phone conversation. Be friendly and concise. If unsure, add something like "I believe so" or "Let me confirm that for you."
`;

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a polite voice AI assistant for a business call center." },
              { role: "user", content: adaptivePrompt },
            ],
            max_tokens: 120,
            temperature: 0.8,
          });
          tunedResponse =
            completion.choices?.[0]?.message?.content?.trim() || top.answer;
        } catch (gptErr) {
          console.error("⚠️ Adaptive GPT error:", gptErr.message);
        }
      }
    } else {
      tunedResponse =
        "I’m not sure about that. Would you like me to connect you with someone from our team?";
    }

    // 4️⃣ Log adaptive response
    await logAdaptiveResponse(query, tunedResponse, confidence);

    // 5️⃣ Respond to client
    res.json({
      query,
      confidence,
      tuned_response: tunedResponse,
      matches: rows,
    });
  } catch (err) {
    console.error("❌ /brain/query failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Utility: logAdaptiveResponse ----------
async function logAdaptiveResponse(query, response, confidence) {
  try {
    const logEntry = `[${new Date().toISOString()}] confidence=${confidence} | query="${query}" | response="${response}"\n`;
    await fs.promises.appendFile(LOG_PATH, logEntry, { encoding: "utf8" });
  } catch (err) {
    console.error("⚠️ Log write failed:", err.message);
  }
}

module.exports = router;
