// ============================================
// embeddingManager.js — Story 2.8 Tenant Isolation
// ============================================

const { Pool } = require("pg");
const OpenAI = require("openai");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// get existing or create new embedding space for a business
async function getOrCreateEmbeddingSpace(business_id) {
  const res = await pool.query(
    "SELECT id FROM embedding_spaces WHERE business_id=$1 LIMIT 1",
    [business_id]
  );
  if (res.rows.length) return res.rows[0].id;

  const insert = await pool.query(
    "INSERT INTO embedding_spaces (business_id) VALUES ($1) RETURNING id",
    [business_id]
  );
  return insert.rows[0].id;
}

// embed text for a business and return {spaceId, vector}
async function embedTextForBusiness(business_id, text) {
  const spaceId = await getOrCreateEmbeddingSpace(business_id);
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return { spaceId, vector: embedding.data[0].embedding };
}

module.exports = { getOrCreateEmbeddingSpace, embedTextForBusiness };

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
  const res = await pool.query(query, [business_id, vector, limit]);
  return res.rows;
}

module.exports = {
  getOrCreateEmbeddingSpace,
  embedTextForBusiness,
  getNearestEmbeddingsForBusiness, // ✅ add this
};

