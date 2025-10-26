// ===============================================
// src/routes/brain.js
// Story 2.9 — Adaptive Response Tuning for ACA
// + Story 9.6 — Multilingual / Tenant-Aware Query Layer
// ===============================================
const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const pool = require("../db/pool");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log("🔥 Story 2.9 adaptive router executing");

const LOG_PATH = path.join(__dirname, "..", "logs", "response_tuning.log");
try {
  const logDir = path.dirname(LOG_PATH);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
} catch (e) {
  console.warn("⚠️ Log dir check failed:", e.message);
}

router.post("/query", async (req, res) => {
  console.log("🟡 Story 2.9 adaptive tuning layer active");

  const { tenant_id, business_id, query, language = "en-US", top_k = 3 } = req.body;
  const resolvedId = tenant_id || business_id;
  if (!resolvedId || !query)
    return res.status(400).json({ ok: false, error: "tenant_id (or business_id) and query required" });

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
      SELECT id, query_text AS question, answer,
             1 - (embedding <=> $1::vector) AS similarity
        FROM kb_entries
       WHERE tenant_id = $2
    ORDER BY embedding <=> $1::vector
       LIMIT $3;
      `,
      [vectorLiteral, resolvedId, top_k]
    );

    const rows = result.rows;
    let tunedResponse = null;
    let confidence = 0;

    if (rows.length > 0) {
      const top = rows[0];
      confidence = parseFloat(top.similarity || 0).toFixed(2);
      tunedResponse = top.answer;

      if (confidence < 0.88) {
        const adaptivePrompt = `
Caller asked: "${query}"
Language: ${language}
Closest KB answer (candidate): "${top.answer}"
Similarity score: ${confidence}

Rewrite this answer naturally for a ${language} phone conversation.
Be friendly and concise. If unsure, add something like
"I believe so" or "Let me confirm that for you."
`;
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a polite multilingual voice AI assistant for a business call center." },
              { role: "user", content: adaptivePrompt },
            ],
            max_tokens: 120,
            temperature: 0.8,
          });
          tunedResponse = completion.choices?.[0]?.message?.content?.trim() || top.answer;
        } catch (gptErr) {
          console.error("⚠️ Adaptive GPT error:", gptErr.message);
        }
      }
    } else {
      tunedResponse = "I’m not sure about that. Would you like me to connect you with someone from our team?";
    }

    await logAdaptiveResponse(query, tunedResponse, confidence, resolvedId, language);

    res.json({
      ok: true,
      tenant_id: resolvedId,
      language,
      confidence,
      tuned_response: tunedResponse,
      matches: rows,
    });
  } catch (err) {
    console.error("❌ /brain/query failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function logAdaptiveResponse(query, response, confidence, id, lang) {
  try {
    const logEntry = `[${new Date().toISOString()}] tenant=${id} lang=${lang} confidence=${confidence} | query="${query}" | response="${response}"\n`;
    await fs.promises.appendFile(LOG_PATH, logEntry, { encoding: "utf8" });
  } catch (err) {
    console.error("⚠️ Log write failed:", err.message);
  }
}

module.exports = router;
