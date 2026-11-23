
const { Pool } = require("pg");
const OpenAI = require("openai");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode")
    ? { rejectUnauthorized: false }
    : undefined,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------------------------------------------------------------
// getOrCreateEmbeddingSpace
// ---------------------------------------------------------------------------
async function getOrCreateEmbeddingSpace(business_id) {
  const { rows } = await pool.query(
    `SELECT id FROM embedding_spaces WHERE business_id = $1`,
    [business_id]
  );

  if (rows.length) return rows[0].id;

  const insert = await pool.query(
    `INSERT INTO embedding_spaces (business_id)
     VALUES ($1)
     RETURNING id`,
    [business_id]
  );

  return insert.rows[0].id;
}

// ---------------------------------------------------------------------------
// embedTextForBusiness — tenant-scoped embedding
// ---------------------------------------------------------------------------
async function embedTextForBusiness(business_id, text) {
  // ✅ Always coerce to string so we never send a raw number like 1
  const safeText = String(text ?? "");
  console.log(
    "🔍 embedTextForBusiness input type:",
    typeof text,
    "| preview:",
    safeText.slice(0, 80)
  );

  const spaceId = await getOrCreateEmbeddingSpace(business_id);

  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: safeText,
  });

  return {
    spaceId,
    vector: embedding.data[0].embedding,
  };
}

// ---------------------------------------------------------------------------
// embedText — generic embedding (used by uploadKnowledge)
// ---------------------------------------------------------------------------
async function embedText(text) {
  // ✅ Always coerce to string so we never send a raw number like 1
  const safeText = String(text ?? "");
  console.log(
    "🔍 embedText input type:",
    typeof text,
    "| preview:",
    safeText.slice(0, 80)
  );

  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: safeText,
  });

  return embedding.data[0].embedding;
}

// ---------------------------------------------------------------------------
// getNearestEmbeddingsForBusiness — tenant-isolated retrieval
// ---------------------------------------------------------------------------
async function getNearestEmbeddingsForBusiness(
  business_id,
  vector,
  limit = 5
) {
  const query = `
    SELECT id, query_text AS question, answer, embedding
    FROM kb_entries
    WHERE tenant_id = $1
    ORDER BY embedding <-> $2::vector
    LIMIT $3
  `;

  const vectorLiteral = Array.isArray(vector) ? "[" + vector.join(",") + "]" : vector;
  const { rows } = await pool.query(query, [
    business_id,
    vectorLiteral,
    limit,
  ]);

  return rows;
}

module.exports = {
  getOrCreateEmbeddingSpace,
  embedTextForBusiness,
  embedText,
  getNearestEmbeddingsForBusiness,
};
