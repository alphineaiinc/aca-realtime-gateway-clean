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
// 🧠 In-memory call sessions (per Call SID)
// ------------------------------------------------------------------
// Map<sessionId, { turns: Array<{user, bot, ts}>, createdAt: number }>
const callSessions = new Map();

// small cleanup helper so memory doesn't grow forever
function getOrCreateSession(sessionId) {
  if (!sessionId) return null;

  const now = Date.now();
  const SESSION_TTL_MS = 30 * 60 * 1000;

  // basic TTL cleanup
  for (const [id, s] of callSessions.entries()) {
    if (now - (s.createdAt || now) > SESSION_TTL_MS) {
      callSessions.delete(id);
    }
  }

  let session = callSessions.get(sessionId);
  if (!session) {
    session = { turns: [], createdAt: now };
    callSessions.set(sessionId, session);
  }
  return session;
}

// ------------------------------------------------------------------
// 🧹 Post-process GPT answers for phone use
// ------------------------------------------------------------------
function postProcessAnswer(text) {
  if (!text) return "";

  let cleaned = text.trim();

  // strip leading/trailing quotes
  cleaned = cleaned.replace(/^["'“”]+/, "").replace(/["'“”]+$/, "").trim();

  // absolutely forbid some robotic phrases
  const bannedPatterns = [
    /how can i assist you today\??/i,
    /what can i help you with(?: regarding that)?\??/i,
    /how can i help you with your needs(?: today)?\??/i,
    /what do you need assistance with(?: today)?\??/i,
    /i'm here to help!?$/i,
  ];
  for (const pattern of bannedPatterns) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  // If we gutted the end and it ends with a dangling comma/and, tidy it
  cleaned = cleaned.replace(/[,\s]+$/g, "").trim();

  // hard cap length to keep TTS snappy (roughly 2 short sentences)
  const MAX_LEN = 260;
  if (cleaned.length > MAX_LEN) {
    const cut = cleaned.lastIndexOf(".", MAX_LEN);
    if (cut > 80) {
      cleaned = cleaned.slice(0, cut + 1);
    } else {
      cleaned = cleaned.slice(0, MAX_LEN) + "…";
    }
  }

  return cleaned;
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
// 🎯 Domain-specific handler: “tell me about the service”
// ------------------------------------------------------------------
function isServiceIntent(lower, session) {
  if (!lower) return false;

  // Raw phrases
  if (lower.includes("what kind of service")) return true;
  if (lower.includes("know more about the service")) return true;
  if (lower.includes("know more about your service")) return true;
  if (
    lower === "service" ||
    lower === "service." ||
    lower === "offered" ||
    lower === "offered."
  ) {
    return true;
  }

  // If user keeps mentioning "service" after we've already said "call orchestration",
  // treat it as deepening that topic instead of asking for more clarification.
  if (
    lower.includes("service") &&
    session &&
    session.turns.length > 0 &&
    session.turns.slice(-1)[0].bot &&
    session.turns.slice(-1)[0].bot.toLowerCase().includes("call orchestration")
  ) {
    return true;
  }

  return false;
}

function serviceExplainer(turnsSoFar) {
  // First time talking about the service
  if (turnsSoFar === 0) {
    return postProcessAnswer(
      "We run an automated call assistant for businesses. It answers calls, routes them, and handles common questions so you don’t miss important callers. What would you like to know more about – features, pricing, or setup?"
    );
  }

  // Second time / follow-ups – less intro, more direct
  if (turnsSoFar === 1) {
    return postProcessAnswer(
      "In simple terms, we pick up your calls, understand what the caller wants, and either answer them or pass the call or message to the right place. Is your interest more about how it works day to day, or about getting it set up for your business?"
    );
  }

  // Later: keep it short and focused
  return postProcessAnswer(
    "Our service is a smart call assistant that can greet callers, answer FAQs, and route calls. Tell me what you’re most curious about, and I’ll focus on that."
  );
}

// ------------------------------------------------------------------
// ⚡ Fast small-talk / meta / short follow-up handler (no KB)
// ------------------------------------------------------------------
async function quickPhoneReply(userQuery, langCode, convoMeta = {}) {
  const { turnsSoFar = 0, lastBot = null } = convoMeta;

  let system =
    "You are Alphine AI, speaking as a live phone agent. Reply in natural, spoken style.";

  if (langCode === "ta-IN") {
    system = `
You are Alphine AI, replying in Tanglish (Tamil + English mix) on a phone call.
Sound modern and conversational, not robotic.`;
  } else if (langCode === "hi-IN") {
    system =
      "You are Alphine AI on a phone call. Reply in Hinglish (Hindi + English mix), casual daily speech.";
  } else if (langCode === "es-ES") {
    system =
      "You are Alphine AI on a phone call. Reply in Spanish, casual and modern, allow some English words.";
  }

  system += `
The caller is saying a short phrase like:
- greetings: hello, hi, hey
- checks: are you there, can you hear me
- acknowledgements: yes, okay, sure, sounds good
- closings: thank you, bye
or a very short follow-up to your previous answer.

Rules:
- Sound like a real person, not a script.
- Keep replies very short and immediate.
- Aim for 1 sentence; at most 2 short sentences.
- Do NOT say generic support phrases like:
  "How can I assist you today?",
  "How can I help you with your needs today?",
  "What can I help you with regarding that?"
- Instead, respond in a specific, grounded way based on what they just said.
- If they already know you’re Alphine AI, don’t re-introduce yourself.`;

  if (lastBot) {
    system += `
You previously said to the caller: "${lastBot}".
The caller is now replying to that, so continue the same topic naturally.
Do NOT repeat the same idea you just said. Move the conversation forward.`;
  }

  if (turnsSoFar === 0) {
    system += `
This is the first turn you are speaking. You may include a brief friendly greeting plus a short helpful question, but keep it under 2 short sentences.`;
  } else {
    system += `
This is a continuing conversation. Do NOT re-introduce yourself and do NOT repeat your earlier greeting.`;
  }

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
          { role: "system", content: system },
          {
            role: "user",
            content: `Caller said (short phrase): "${userQuery}". Reply like a live phone agent, keep it brief.`,
          },
        ],
      },
    },
    { retries: 3, baseDelayMs: 250, maxDelayMs: 3000 }
  ).catch((err) => {
    console.error("❌ quickPhoneReply failed:", err.message);
    observeHttpRetry();
    throw err;
  });

  const raw = completion.data.choices[0].message.content.trim();
  return postProcessAnswer(raw);
}

// ------------------------------------------------------------------
// 💬 Polishing step with Tanglish / Hinglish + per-call style
// ------------------------------------------------------------------
async function polishAnswer(rawText, userQuery, langCode, convoMeta = {}) {
  const { turnsSoFar = 0, lastBot = null } = convoMeta;
  const isFirstTurn = turnsSoFar === 0;

  let styleInstruction = `
You are Alphine AI, a friendly voice assistant on a phone call.
- Respond in 1–2 short sentences (max ~25 spoken words).
- Answer the caller's last message as directly as possible.
- Do NOT say generic phrases like "I'm here to help" or 
  "How can I assist you today?" unless the caller explicitly asks 
  if you're there or if you can help.
- Do NOT repeat the same reassurance or question multiple times.
- Sound natural and conversational, like a real person on the phone.
`;

  if (langCode === "ta-IN") {
    styleInstruction = `
You are Alphine AI, replying in Tanglish (Tamil + English mix) on a phone call.
- Use Tamil script for Tamil words.
- Keep common English words (days, times, numbers).
- Avoid pure English or pure Tamil.
- Sound modern and conversational, like a real person.`;
  } else if (langCode === "hi-IN") {
    styleInstruction =
      "You are Alphine AI on a phone call. Reply in Hinglish (Hindi + English mix), casual daily speech.";
  } else if (langCode === "es-ES") {
    styleInstruction =
      "You are Alphine AI on a phone call. Reply in Spanish, casual and modern, allow some English words.";
  }

  // Conversation behavior based on turn index
  if (isFirstTurn) {
    styleInstruction += `
This is the first turn of the phone call.
- Give a brief friendly greeting AND one very short question inviting the caller to share what they need.
- Mention Alphine AI or the service at most once.
- Keep it within 1–2 short sentences.`;
  } else {
    styleInstruction += `
This is a continuing phone conversation.
- The assistant has ALREADY greeted the caller earlier.
- Answer directly to the latest user message.
- Do NOT repeat generic phrases like "How can I assist you today?", "What can I help you with regarding that?", or "I'm here to help."
- Do NOT re-introduce yourself.
- Prefer 1–2 short spoken-style sentences unless the user explicitly asks for detailed explanation.`;
  }

  styleInstruction += `
If the user only says something like "hello", "are you there?", "yes", "ok", "thank you" or similar:
- Respond with a VERY short confirmation (1 short sentence) and, if helpful, a tiny follow-up.
Avoid repeating the same idea in different words in back-to-back turns. Move the conversation forward.`;

  if (lastBot) {
    styleInstruction += `
Previously you said to the caller: "${lastBot}".
Do NOT repeat that same content again. Only add something new or answer their latest question.`;
  }

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

  return postProcessAnswer(answer);
}

// ------------------------------------------------------------------
// 🔁 Retrieval Pipeline with per-call session & small-talk fast path
// ------------------------------------------------------------------
async function retrieveAnswer(
  userQuery,
  tenantId,
  langCode = "en-US",
  sessionId = null
) {
  let session = null;
  let turnsSoFar = 0;
  let lastBot = null;

  if (sessionId) {
    session = getOrCreateSession(sessionId);
    if (session) {
      turnsSoFar = session.turns.length;
      if (turnsSoFar > 0) {
        lastBot = session.turns[turnsSoFar - 1].bot;
      }
    }
  }

  const text = (userQuery || "").trim();
  const lower = text.toLowerCase();

  // 🔊 Direct presence / hearing checks → immediate, fixed reply
  if (
    /can you hear me\??/.test(lower) ||
    /^are you there[?.!]*$/.test(lower) ||
    /^are you still there[?.!]*$/.test(lower)
  ) {
    const direct = postProcessAnswer(
      "Yes, I can hear you clearly. I’m right here with you. What would you like to know about the service?"
    );
    if (session) {
      session.turns.push({ user: text, bot: direct, ts: Date.now() });
      if (session.turns.length > 10) {
        session.turns.splice(0, session.turns.length - 10);
      }
    }
    return direct;
  }

  // 🔎 Heuristic: treat very short meta phrases as small talk
  const smallTalkPhrases = [
    "hi",
    "hi.",
    "hello",
    "hello.",
    "hey",
    "hey.",
    "are you there",
    "are you there?",
    "can you hear me",
    "can you hear me?",
    "you there",
    "you there?",
    "ok",
    "ok.",
    "okay",
    "okay.",
    "thank you",
    "thank you.",
    "thanks",
    "thanks.",
    "bye",
    "bye.",
    "goodbye",
    "goodbye.",
    "see you",
    "see you.",
    "hello?",
    "are you still there",
    "are you still there?",
    "yes",
    "yes.",
    "yeah",
    "yeah.",
    "yep",
    "yep.",
    "sure",
    "sure.",
    "no",
    "no.",
    "nope",
    "nope.",
  ];

  const isSmallTalk =
    lower.length > 0 &&
    (smallTalkPhrases.includes(lower) ||
      lower === "it's going good." ||
      lower === "it's going good" ||
      // short “hear me” / “can you?” variants from the logs
      (lower.length <= 20 && /hear me/.test(lower)) ||
      (lower.length <= 20 && /can you\??$/.test(lower)));

  // 🎯 Domain-specific: service explainer path
  if (isServiceIntent(lower, session)) {
    const answer = serviceExplainer(turnsSoFar);
    if (session) {
      session.turns.push({ user: text, bot: answer, ts: Date.now() });
      if (session.turns.length > 10) {
        session.turns.splice(0, session.turns.length - 10);
      }
    }
    return answer;
  }

  // ⚡ Fast path: pure small-talk / short follow-up → skip KB + embeddings
  if (isSmallTalk) {
    try {
      const quick = await quickPhoneReply(text, langCode, {
        turnsSoFar,
        lastBot,
      });
      if (session) {
        session.turns.push({ user: text, bot: quick, ts: Date.now() });
        if (session.turns.length > 10) {
          session.turns.splice(0, session.turns.length - 10);
        }
      }
      return quick;
    } catch (err) {
      console.error(
        "❌ quickPhoneReply path failed, falling back to KB:",
        err
      );
      // fall through to normal KB flow
    }
  }

  try {
    const result = await searchKB(text, tenantId);
    if (!result) {
      console.log("ℹ️ No KB match found, returning fallback answer.");
      const fallback = postProcessAnswer(
        "I couldn’t find that in my notes right now, but you can ask me something else about the service."
      );
      if (session) {
        session.turns.push({ user: text, bot: fallback, ts: Date.now() });
      }
      return fallback;
    }

    const answer = await polishAnswer(result.answer, text, langCode, {
      turnsSoFar,
      lastBot,
    });

    if (session) {
      session.turns.push({ user: text, bot: answer, ts: Date.now() });
      // cap memory to last 10 turns
      if (session.turns.length > 10) {
        session.turns.splice(0, session.turns.length - 10);
      }
    }

    return answer;
  } catch (err) {
    console.error("❌ searchKB error (DB or embeddings):", err);
    const fallback = postProcessAnswer(
      "I’m having a bit of trouble looking that up right now, but I’m still here with you."
    );
    if (session) {
      session.turns.push({ user: text, bot: fallback, ts: Date.now() });
    }
    return fallback;
  }
}

module.exports = { retrieveAnswer };
