const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

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
  console.error("❌ OPENAI_API_KEY not loaded. Check .env in project root.");
  process.exit(1);
}

// ------------------------------------------------------------------
// 🗄️ Database + OpenAI Clients
// ------------------------------------------------------------------
const pool = new Pool({ connectionString: process.env.KB_DB_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log("🧩 retriever.js loaded – OpenAI client embeddings v2");

// ------------------------------------------------------------------
// 🔍 Search KB by vector similarity (tenant-scoped)
// ------------------------------------------------------------------
async function searchKB(query, tenantId, topK = 1) {
  // --- Normalize query into a safe string for embeddings ---
  let normalizedQuery;

  if (typeof query === "string") {
    normalizedQuery = query;
  } else if (query == null) {
    normalizedQuery = "";
  } else if (Array.isArray(query)) {
    // If somehow an array sneaks in, join it into a single string
    normalizedQuery = query.map((x) => String(x ?? "")).join(" ");
  } else {
    // Objects / numbers / anything else → stringify
    normalizedQuery = String(query);
  }

  console.log("🔍 searchKB embedding input preview:", {
    originalType: typeof query,
    normalizedLength: normalizedQuery.length,
  });

  // --- Embedding via official OpenAI client (no raw Axios) ---
  let queryEmbeddingVector;

  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: normalizedQuery,
    });

    queryEmbeddingVector = embeddingResponse.data[0].embedding;
  } catch (err) {
    console.error("❌ Failed to get embedding (OpenAI client):", err.message);

    // New OpenAI client error shape
    if (err.error) {
      console.error("❌ Embedding error detail (err.error):", err.error);
    } else if (err.response?.data?.error) {
      console.error("❌ Embedding error detail (response.data.error):", err.response.data.error);
    }

    observeHttpRetry();
    throw err;
  }

  // pgvector expects a literal like '[1,2,3,...]'
  const queryEmbedding = `[${queryEmbeddingVector.join(",")}]`;

  try {
    const { rows } = await pool.query(
      `SELECT id,
              tenant_id,
              query_text,
              answer,
              1 - (embedding <=> $1::vector) AS similarity
       FROM kb_entries
       WHERE tenant_id = $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [queryEmbedding, tenantId, topK]
    );

    if (rows.length === 0) return null;
    return { answer: rows[0].answer, similarity: rows[0].similarity };
  } catch (err) {
    console.error("❌ searchKB DB error:", err.message);
    throw err;
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
    styleInstruction = "Reply in Hinglish (Hindi + English mix), casual daily speech.";
  } else if (langCode === "es-ES") {
    styleInstruction = "Reply in Spanish, casual and modern, allow some English words.";
  }

  // --- Resilient completion call via safeAxios ---
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
async function retrieveAnswer(userQuery, tenantId, langCode = "en-US") {
  try {
    const result = await searchKB(userQuery, tenantId);
    if (!result) {
      console.log("ℹ️ No KB match found, returning fallback answer.");
      return "I couldn’t find the answer right now.";
    }
    return await polishAnswer(result.answer, userQuery, langCode);
  } catch (err) {
    console.error("❌ searchKB error (DB or embeddings):", err);
    return "I’m having trouble looking that up right now.";
  }
}

module.exports = { retrieveAnswer };
