// retriever.js
// Story 5.3.A — Resilient Orchestrator Edition
// (adds safeAxios wrapper + retry/backoff + resilience metrics)

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "./.env") });

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
  console.error("❌ OPENAI_API_KEY not loaded. Check .env in aca-orchestrator.");
  process.exit(1);
}

if (!process.env.KB_DB_URL) {
  console.error("❌ KB_DB_URL not set. Point this to the Neon DB that holds kb_entries.");
  process.exit(1);
}

// ------------------------------------------------------------------
// 🗄️ Database + OpenAI Clients
// ------------------------------------------------------------------
const pool = new Pool({ connectionString: process.env.KB_DB_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ------------------------------------------------------------------
// 🔍 Search KB by vector similarity (tenant-scoped)
//   NOTE: DB schema:
//     tenant_id  | integer
//     query_text | text
//     answer     | text
//     embedding  | vector(1536)
// ------------------------------------------------------------------
async function searchKB(query, tenantId, topK = 1) {
  try {
    // --- Resilient embedding call ---
    const embeddingResponse = await requestWithRetry(
      {
        method: "post",
        url: "https://api.openai.com/v1/embeddings",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        data: { model: "text-embedding-3-small", input: query },
      },
      { retries: 4, baseDelayMs: 300, maxDelayMs: 4000 }
    );

    const queryEmbedding = `[${embeddingResponse.data.data[0].embedding.join(",")}]`;

    const { rows } = await pool.query(
      `SELECT id,
              query_text,
              answer,
              1 - (embedding <=> $1::vector) AS similarity
       FROM kb_entries
       WHERE tenant_id = $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [queryEmbedding, tenantId, topK]
    );

    if (rows.length === 0) {
      console.log("ℹ️ searchKB: no rows for tenant_id =", tenantId);
      return null;
    }

    return { answer: rows[0].answer, similarity: rows[0].similarity };
  } catch (err) {
    console.error("❌ searchKB error (DB or embeddings):", err);
    observeHttpRetry();
    // Fail soft so the call doesn’t hard-crash
    return null;
  }
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
    styleInstruction =
      "Reply in Hinglish (Hindi + English mix), casual daily speech.";
  } else if (langCode === "es-ES") {
    styleInstruction =
      "Reply in Spanish, casual and modern, allow some English words.";
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
//   NOTE: second parameter is currently called `businessId` in callers,
//   but it should actually be the tenant id that matches kb_entries.tenant_id.
// ------------------------------------------------------------------
async function retrieveAnswer(userQuery, businessId, langCode = "en-US") {
  // Here businessId is effectively the tenant_id for kb_entries
  const result = await searchKB(userQuery, businessId);
  if (!result) return "I couldn’t find the answer right now.";
  return await polishAnswer(result.answer, userQuery, langCode);
}

module.exports = { retrieveAnswer };
