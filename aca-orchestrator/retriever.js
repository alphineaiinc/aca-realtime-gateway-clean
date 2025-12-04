// retriever.js
// Story 5.3.A — Resilient Orchestrator Edition
// (adds safeAxios wrapper + retry/backoff + resilience metrics)

const path = require("path");

// ✅ Load orchestrator-level .env (same style as index.js)
const dotenvPath = path.resolve(__dirname, "./.env");
console.log("🧩 retriever.js loading .env from:", dotenvPath);
require("dotenv").config({ path: dotenvPath, override: true });

const { Pool } = require("pg");
const OpenAI = require("openai");

// ------------------------------------------------------------------
// 🧠 Resilient HTTP + Metrics
// ------------------------------------------------------------------
const { requestWithRetry } = require("./src/brain/utils/safeAxios");
const { observeHttpRetry } = require("./src/monitor/resilienceMetrics");

// ------------------------------------------------------------------
// 🔐 Environment Validation
// ------------------------------------------------------------------
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY not loaded. Check .env in orchestrator root.");
  process.exit(1);
}

// Prefer dedicated KB_DB_URL, but fall back to DATABASE_URL for safety
const KB_CONN_STRING = process.env.KB_DB_URL || process.env.DATABASE_URL;
if (!KB_CONN_STRING) {
  console.error("❌ No KB_DB_URL or DATABASE_URL set for retriever.js database connection.");
  process.exit(1);
}

// ------------------------------------------------------------------
// 🗄️ Database + OpenAI Clients
// ------------------------------------------------------------------
const pool = new Pool({ connectionString: KB_CONN_STRING });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ------------------------------------------------------------------
// 🔍 Search KB by vector similarity
// ------------------------------------------------------------------
async function searchKB(query, businessId, topK = 1) {
  // ✅ Always coerce query to string to avoid sending raw numbers to embeddings
  const safeQuery = String(query ?? "");
  if (typeof query !== "string") {
    console.warn(
      "⚠️ searchKB received non-string query:",
      typeof query,
      "value=",
      query
    );
  }
  console.log("🔎 searchKB embedding preview:", safeQuery.slice(0, 80));

  // --- Resilient embedding call ---
  const embeddingResponse = await requestWithRetry(
    {
      method: "post",
      url: "https://api.openai.com/v1/embeddings",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      data: { model: "text-embedding-3-small", input: safeQuery },
    },
    { retries: 4, baseDelayMs: 300, maxDelayMs: 4000 }
  ).catch((err) => {
    console.error("❌ Failed to get embedding:", err.message);
    observeHttpRetry();
    throw err;
  });

  const queryEmbedding = `[${embeddingResponse.data.data[0].embedding.join(",")}]`;

  const { rows } = await pool.query(
    `SELECT id, answer, embedding
            , 1 - (embedding <=> $1::vector) AS similarity
     FROM kb_entries
     WHERE business_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [queryEmbedding, businessId, topK]
  );

  if (rows.length === 0) return null;
  return { answer: rows[0].answer, similarity: rows[0].similarity };
}

// ------------------------------------------------------------------
// 💬 Polishing step with Tanglish / Hinglish
// ------------------------------------------------------------------
async function polishAnswer(rawText, userQuery, langCode) {
  let styleInstruction = "Reply politely in natural spoken style.";

  if (langCode === "ta-IN") {
    styleInstruction = `
You are Alphine AI, replying in Tanglish (Tamil + English mix).
- Use Tamil script for Tamil words.
- Keep common English words (days, times, numbers).
- Avoid pure English or pure Tamil.
- Sound modern and conversational, like a real person.`;
  } else if (langCode === "hi-IN") {
    styleInstruction = "Reply in Hinglish (Hindi + English mix), casual daily speech.";
  } else if (langCode === "es-ES") {
    styleInstruction = "Reply in Spanish, casual and modern, allow some English words.";
  }

  // --- Resilient completion call ---
  const completion = await requestWithRetry(
    {
      method: "post",
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      data: {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: styleInstruction },
          {
            role: "user",
            content: `User asked: "${userQuery}". KB says: "${rawText}". Reply naturally.`,
          },
        ],
      },
    },
    { retries: 4, baseDelayMs: 300, maxDelayMs: 5000 }
  ).catch((err) => {
    console.error("❌ Failed to get completion:", err.message);
    observeHttpRetry();
    throw err;
  });

  let answer = completion.data.choices[0].message.content.trim();

  // Safety net: if GPT still gave English for Tamil, transliterate
  if (langCode === "ta-IN" && !/[\u0B80-\u0BFF]/.test(answer)) {
    console.log("⚠️ Answer came back in English → forcing Tamil transliteration.");

    const retry = await requestWithRetry(
      {
        method: "post",
        url: "https://api.openai.com/v1/chat/completions",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        data: {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Transliterate this English answer into Tanglish (Tamil + English mix). Use Tamil script for Tamil words, keep English for numbers/days. Keep it short and conversational.",
            },
            { role: "user", content: answer },
          ],
        },
      },
      { retries: 3, baseDelayMs: 300, maxDelayMs: 4000 }
    ).catch((err) => {
      console.error("❌ Transliteration retry failed:", err.message);
      observeHttpRetry();
      throw err;
    });

    answer = retry.data.choices[0].message.content.trim();
  }

  return answer;
}

// ------------------------------------------------------------------
// 🔁 Retrieval Pipeline
// ------------------------------------------------------------------
async function retrieveAnswer(userQuery, businessId, langCode = "en-US") {
  const result = await searchKB(userQuery, businessId);
  if (!result) return "I couldn’t find the answer right now.";
  return await polishAnswer(result.answer, userQuery, langCode);
}

module.exports = { retrieveAnswer };
