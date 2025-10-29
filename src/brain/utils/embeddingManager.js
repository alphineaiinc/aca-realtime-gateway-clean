// ==========================================================
// src/brain/utils/embeddingManager.js
// Embedding manager — tenant-scoped embedding spaces + retrieval
// ==========================================================
require("dotenv").config();

const { Pool } = require("pg");
const OpenAI = require("openai");

// Initialize clients
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// getOrCreateEmbeddingSpace
// Ensures embeddings are tenant-scoped
// ---------------------------------------------------------------------------
async function getOrCreateEmbeddingSpace(business_id) {
  const q = `
    SELECT id
    FROM embedding_spaces
    WHERE business_id = $1
    LIMIT 1
  `;
  const existing = await pool.query(q, [business_id]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const insert = `
    INSERT INTO embedding_spaces (business_id)
    VALUES ($1)
    RETURNING id
  `;
  const created = await pool.query(insert, [business_id]);
  return created.rows[0].id;
}

// ---------------------------------------------------------------------------
// embedTextForBusiness
// Embeds text and returns { spaceId, vector } for tenant-scoped storage
// ---------------------------------------------------------------------------
async function embedTextForBusiness(business_id, text) {
  const spaceId = await getOrCreateEmbeddingSpace(business_id);

  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return { spaceId, vector: embedding.data[0].embedding };
}

// ---------------------------------------------------------------------------
// embedText — generic text embedding (no tenant context)
// Used by uploadKnowledge.js for quick chunk embedding
// ---------------------------------------------------------------------------
async function embedText(text) {
  if (typeof text !== "string") {
    throw new Error("embedText: input must be a string");
  }

  // Security / stability guard: prevent huge payloads from blowing tokens/memory
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("embedText: input is empty");
  }
  if (trimmed.length > 50_000) {
    throw new Error("embedText: input too large");
  }

  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: trimmed,
  });

  return embedding.data[0].embedding;
}

// ============================================
// getNearestEmbeddingsForBusiness
// Ensures retrieval is tenant-scoped
// ============================================
async function getNearestEmbeddingsForBusiness(business_id, vector, limit = 5) {
  const query = `
      SELECT id, question, answer, embedding
      FROM kb_entries
      WHERE business_id = $1
      ORDER BY embedding <-> $2
      LIMIT $3;
    `;
  const result = await pool.query(query, [business_id, vector, limit]);
  return result.rows;
}

module.exports = {
  getOrCreateEmbeddingSpace,
  embedTextForBusiness,
  embedText,
  getNearestEmbeddingsForBusiness,
};
