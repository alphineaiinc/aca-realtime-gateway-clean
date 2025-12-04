// retriever.js
// Story 5.3.A — Resilient Orchestrator Edition
// (adds safeAxios wrapper + retry/backoff + resilience metrics)

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
// 🧠 Simple in-memory call sessions (per Call SID)
// ------------------------------------------------------------------
// Map<sessionId, { turns: Array<{user, bot, ts}>, createdAt: number }>
const callSessions = new Map();

// small cleanup helper so memory doesn't grow forever
function getOrCreateSession(sessionId) {
  if (!sessionId) return null;

  let session = callSessions.get(sessionId);
  const now = Date.now();

  // basic TTL cleanup (30 minutes)
  const SESSION_TTL_MS = 30 * 60 * 1000;
  for (const [id, s] of callSessions.entries()) {
    if (now - (s.createdAt || now) > SESSION_TTL_MS) {
      callSessions.delete(id);
    }
  }

  if (!session) {
    session = { turns: [], createdAt: now };
    callSessions.set(sessionId, session);
  }
  return session;
}

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
      console.error(
        "❌ Embedding error detail (response.data.error):",
        err.response.data.error
      );
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
// 💬 Polishing step with Tanglish / Hinglish + per-call style
// ------------------------------------------------------------------
async function polishAnswer(rawText, userQuery, langCode, convoMeta = {}) {
  const { turnsSoFar = 0 } = convoMeta;
  const isFirstTurn = turnsSoFar === 0;

  let styleInstruction = "You are Alphine AI, speaking on a phone call. Reply politely in natural spoken style.";

  if (langCode === "ta-IN") {
    styleInstruction = `
You are Alphine AI, replying in Tanglish (Tamil + English mix) on a phone call.
- Use Tamil script for Tamil words.
- Keep common English words (days, times, numbers).
- Avoid pure English or pure Tamil.
- Sound modern and conversational, like a real person.`;
  } else if (langCode === "hi-IN") {
    styleInstruction = "You are Alphine AI on a phone call. Reply in Hinglish (Hindi + English mix), casual daily speech.";
  } else if (langCode === "es-ES") {
    styleInstruction = "You are Alphine AI on a phone call. Reply in Spanish, casual and modern, allow some English words.";
  }

  // Conversation behavior based on turn index
  if (isFirstTurn) {
    styleInstruction += `
This is the first turn of the phone call.
- Give a brief friendly greeting AND one very short question inviting the caller to share what they need.
- Mention Alphine AI or the service once.
- Do NOT be wordy; keep it within 1–2 sentences.`;
  } else {
    styleInstruction += `
This is a continuing phone conversation.
- The assistant has ALREADY greeted the caller earlier.
- Answer directly to the latest user message.
- Do NOT repeat generic phrases like "How can I assist you today?" or re-introduce yourself.
- Keep responses concise unless the user explicitly asks for details.`;
  }

  styleInstruction += `
If the user only says something like "hello", "are you there?", "can you hear me?" or similar:
- Respond with a VERY short confirmation (1 short sentence) and, if helpful, a tiny follow-up question.
Always sound like a real person on a live call, not like a chatbot script.`;

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
            content: `Caller just said: "${userQuery}". The knowledge base says: "${rawText}". Reply as a live phone agent.`,
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
// 🔁 Retrieval Pipeline with per-call session
// ------------------------------------------------------------------
async function retrieveAnswer(userQuery, tenantId, langCode = "en-US", sessionId = null) {
  let session = null;
  let turnsSoFar = 0;

  if (sessionId) {
    session = getOrCreateSession(sessionId);
    if (session) {
      turnsSoFar = session.turns.length;
    }
  }

  try {
    const result = await searchKB(userQuery, tenantId);
    if (!result) {
      console.log("ℹ️ No KB match found, returning fallback answer.");
      const fallback = "I couldn’t find the answer right now.";
      if (session) {
        session.turns.push({ user: userQuery, bot: fallback, ts: Date.now() });
      }
      return fallback;
    }

    const answer = await polishAnswer(result.answer, userQuery, langCode, {
      turnsSoFar,
    });

    if (session) {
      session.turns.push({ user: userQuery, bot: answer, ts: Date.now() });
      // cap memory to last 10 turns
      if (session.turns.length > 10) {
        session.turns.splice(0, session.turns.length - 10);
      }
    }

    return answer;
  } catch (err) {
    console.error("❌ searchKB error (DB or embeddings):", err);
    const fallback = "I’m having trouble looking that up right now.";
    if (session) {
      session.turns.push({ user: userQuery, bot: fallback, ts: Date.now() });
    }
    return fallback;
  }
}

module.exports = { retrieveAnswer };
