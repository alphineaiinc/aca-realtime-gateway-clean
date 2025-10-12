// retriever.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { Pool } = require("pg");
const OpenAI = require("openai");

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY not loaded. Check .env in project root.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.KB_DB_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- Search KB by vector similarity ----------
async function searchKB(query, businessId, topK = 1) {
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  // Convert array to pgvector format
  const queryEmbedding = `[${embeddingResponse.data[0].embedding.join(",")}]`;

  const { rows } = await pool.query(
    `SELECT id, question, answer,
            1 - (embedding <=> $1::vector) AS similarity
     FROM kb_entries
     WHERE business_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [queryEmbedding, businessId, topK]
  );

  if (rows.length === 0) return null;
  return { answer: rows[0].answer, similarity: rows[0].similarity };
}

// ---------- Polishing step with Tanglish / Hinglish ----------
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

  // First attempt
  let completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: styleInstruction },
      {
        role: "user",
        content: `User asked: "${userQuery}". KB says: "${rawText}". Reply naturally.`,
      },
    ],
  });

  let answer = completion.choices[0].message.content.trim();

  // Safety net: if GPT still gave English for Tamil, transliterate
  if (langCode === "ta-IN" && !/[\u0B80-\u0BFF]/.test(answer)) {
    console.log("⚠️ Answer came back in English → forcing Tamil transliteration.");
    const retry = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Transliterate this English answer into Tanglish (Tamil + English mix). Use Tamil script for Tamil words, keep English for numbers/days. Keep it short and conversational.",
        },
        { role: "user", content: answer },
      ],
    });
    answer = retry.choices[0].message.content.trim();
  }

  return answer;
}

// ---------- Retrieval Pipeline ----------
async function retrieveAnswer(userQuery, businessId, langCode = "en-US") {
  const result = await searchKB(userQuery, businessId);
  if (!result) return "I couldn’t find the answer right now.";
  return await polishAnswer(result.answer, userQuery, langCode);
}

module.exports = { retrieveAnswer };
