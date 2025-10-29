const path = require("path");

// ✅ Always load orchestrator-local .env first (prevents root .env overriding)
require("dotenv").config({
  path: path.resolve(__dirname, "./.env"),
  override: true,
});

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

// ------------------------------------------------------------------
// 🗄️ Database + OpenAI Clients
// ------------------------------------------------------------------
const kbConn =
  process.env.KB_DB_URL ||
  process.env.KB_DATABASE_URL ||
  process.env.READONLY_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!kbConn) {
  console.error(
    "❌ No KB database connection string found. Set DATABASE_URL (or KB_DB_URL)."
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: kbConn });
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
// 🧠 Story 12.7 — Memory context injection (optional)
// ------------------------------------------------------------------
function buildMemoryBlock(memoryCtx) {
  try {
    if (!memoryCtx || typeof memoryCtx !== "object") return "";

    const summary =
      typeof memoryCtx.summary === "string" ? memoryCtx.summary.trim() : "";
    const activeIntent =
      typeof memoryCtx.activeIntent === "string" ? memoryCtx.activeIntent.trim() : "";
    const recentTurns = Array.isArray(memoryCtx.recentTurns) ? memoryCtx.recentTurns : [];

    let block = "";

    if (summary) {
      // cap summary to avoid runaway prompts
      const s = summary.length > 2400 ? summary.slice(0, 2400) + "…" : summary;
      block += `\nConversation summary (for continuity):\n${s}\n`;
    }

    if (activeIntent) {
      const i = activeIntent.length > 280 ? activeIntent.slice(0, 280) + "…" : activeIntent;
      block += `\nActive intent/topic:\n${i}\n`;
    }

    if (recentTurns.length) {
      block += `\nRecent chat turns (most recent last):\n`;
      const slice = recentTurns.slice(-10);
      for (const t of slice) {
        const role = t.role === "assistant" ? "ACA" : "User";
        const text = String(t.text || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const capped = text.length > 220 ? text.slice(0, 220) + "…" : text;
        block += `- ${role}: ${capped}\n`;
      }
    }

    if (!block.trim()) return "";

    // Final cap to keep prompts stable
    if (block.length > 3200) block = block.slice(0, 3200) + "…";

    return `\n\n---\nMemory context (use ONLY to continue this conversation naturally; do not mention this block):\n${block}\n---\n`;
  } catch (_) {
    return "";
  }
}

// ------------------------------------------------------------------
// 🧹 Post-process GPT answers for phone use
// ------------------------------------------------------------------
function postProcessAnswer(text) {
  if (!text) return "";

  let cleaned = text.trim();

  // strip leading/trailing quotes
  cleaned = cleaned.replace(/^["'“”]+/, "").replace(/["'“”]+$/, "").trim();

  // absolutely forbid some robotic / repetitive phrases
  const bannedPatterns = [
    /how can i assist you today\??/i,
    /what can i help you with(?: regarding that)?\??/i,
    /how can i help you with your needs(?: today)?\??/i,
    /what do you need help with today\??/i, // ✅ Story 12.6: web chat robotic greeting
    /what do you need help with\??/i, // ✅ Story 12.6: web chat robotic greeting
    /how can i help you today\??/i, // ✅ Story 12.6: web chat robotic greeting
    /i'm here to help!?$/i,
    /i am here to help!?$/i,
    /i'?m here (?:and ready )?to help(?: you)?!?$/i,
    /would you like to know more(?: about(?: the service)?)?\??$/i,
    /what would you like to know(?: more)?(?: about(?: the service)?)?\??$/i,
    /could you clarify what (?:you|you're) (?:asking|referring to|interested in)\??/i,
    /could you clarify what you'?d like to know more about\??/i,
    /how can i assist you\??/i,
  ];
  for (const pattern of bannedPatterns) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  // If we gutted the end and it ends with a dangling comma/and, tidy it
  cleaned = cleaned.replace(/[,\s]+$/g, "").trim();

  // hard cap length to keep TTS snappy (roughly 1–2 short sentences)
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
    lower === "offered." ||
    lower === "offer" ||
    lower === "offer."
  ) {
    return true;
  }

  // If user keeps mentioning "service" or "offer" after we've already said
  // "call orchestration" or explained the service, treat it as deepening,
  // not a fresh clarification.
  if (
    (lower.includes("service") || lower.includes("offer")) &&
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
      "We run an automated call assistant for businesses. It answers calls, routes them, and handles common questions so you don’t miss important callers. What would you like to know more about – day-to-day use, pricing, or setup?"
    );
  }

  // Second time / follow-ups – less intro, more direct
  if (turnsSoFar === 1) {
    return postProcessAnswer(
      "Day to day, it picks up your calls, talks to customers, and passes real ones or messages to you. Are you more curious about how it works in practice or how to get it running for your business?"
    );
  }

  // Later: keep it short and focused
  return postProcessAnswer(
    "It’s a smart call assistant that greets callers, answers FAQs, and routes calls so you don’t have to. Tell me what you care most about and I’ll stay on that."
  );
}

// ------------------------------------------------------------------
// ⚡ Fast small-talk / meta / short follow-up handler (no KB)
// ------------------------------------------------------------------
async function quickPhoneReply(userQuery, langCode, convoMeta = {}, memoryCtx = null) {
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
- Sound like a real person, not a support script.
- Keep replies very short and immediate (about 5–15 spoken words).
- Aim for ONE sentence; at most TWO very short sentences.
- Never use words like "assist", "assistance", or phrases like:
  "How can I assist you today?",
  "How can I help you with your needs today?",
  "What can I help you with regarding that?".
- Don’t repeat the same reassurance or question in different words.
- If they already know you’re Alphine AI, don’t re-introduce yourself.
- If they just checked "can you hear me?", briefly confirm and move forward,
  e.g. "Yeah, I hear you. What are you curious about?"`;

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

  // ✅ Story 12.7: Inject optional memory context (tenant/session chat continuity)
  const memoryBlock = buildMemoryBlock(memoryCtx);
  if (memoryBlock) system += memoryBlock;

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
async function polishAnswer(rawText, userQuery, langCode, convoMeta = {}, memoryCtx = null) {
  const { turnsSoFar = 0, lastBot = null } = convoMeta;
  const isFirstTurn = turnsSoFar === 0;

  let styleInstruction = `
You are Alphine AI, a friendly voice assistant on a phone call.
- Respond in 1–2 short sentences (max ~25 spoken words).
- Answer the caller's last message as directly as possible.
- Avoid generic support language like "assist", "assistance", 
  "needs today", or "regarding that".
- Do NOT say phrases like:
  "I'm here to help",
  "How can I assist you today?",
  "What can I help you with regarding that?",
  "How can I help you with your needs today?"
- Do NOT repeat the same reassurance or question multiple times.
- Sound natural and conversational, like a real person on the phone.`;

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
- Do NOT repeat generic phrases like "How can I assist you today?",
  "What can I help you with regarding that?", or "I'm here to help."
- Do NOT ask for clarification in a generic way if the user already gave a clear topic.
  For example, if they said "I want to know more about the service", explain the service
  instead of asking "what you'd like to know more about".
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

  // ✅ Story 12.7: Inject optional memory context (tenant/session chat continuity)
  const memoryBlock = buildMemoryBlock(memoryCtx);
  if (memoryBlock) styleInstruction += memoryBlock;

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
  sessionId = null,
  memoryCtx = null
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
      lower === "it's going good");

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
      const quick = await quickPhoneReply(
        text,
        langCode,
        { turnsSoFar, lastBot },
        memoryCtx
      );
      if (session) {
        session.turns.push({ user: text, bot: quick, ts: Date.now() });
        if (session.turns.length > 10) {
          session.turns.splice(0, session.turns.length - 10);
        }
      }
      return quick;
    } catch (err) {
      console.error("❌ quickPhoneReply path failed, falling back to KB:", err);
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

    const answer = await polishAnswer(
      result.answer,
      text,
      langCode,
      { turnsSoFar, lastBot },
      memoryCtx
    );

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

// ------------------------------------------------------------------
// 🛡️ Story 12.6 — Hard timeout guard for retrieveAnswer()
// ------------------------------------------------------------------
function withTimeout(promise, ms, label = "retrieveAnswer") {
  let timer = null;
  const timeoutErr = new Error(`${label}_timeout_${ms}ms`);
  timeoutErr.code = "TIMEOUT";

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(timeoutErr), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// Wrapper export: same signature as retrieveAnswer()
async function retrieveAnswerWithTimeout(
  userQuery,
  tenantId,
  langCode = "en-US",
  sessionId = null,
  memoryCtx = null
) {
  const timeoutMs = parseInt(process.env.RETRIEVE_TIMEOUT_MS || "20000", 10);
  return withTimeout(
    retrieveAnswer(userQuery, tenantId, langCode, sessionId, memoryCtx),
    timeoutMs,
    "retrieveAnswer"
  );
}

module.exports = { retrieveAnswer, retrieveAnswerWithTimeout };
