// ingest_kb.js
// Purpose: Ingest TXT/PDF FAQs into Postgres with embeddings (Story 2.5 + Story 2.8 Tenant Isolation)

require("dotenv").config({ path: "../.env" });
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { Client } = require("pg");
const OpenAI = require("openai");

// >>> Story 2.8 addition
const { getOrCreateEmbeddingSpace } = require("./src/brain/utils/embeddingManager");
// <<<

// DB client
const db = new Client({
  user: process.env.POSTGRES_USER,
  host: "localhost",
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT,
});

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Chunking utility
function chunkText(text, maxTokens = 500) {
  const sentences = text.split(/[\.\n]/);
  const chunks = [];
  let current = "";

  for (const s of sentences) {
    if ((current + s).length > maxTokens) {
      chunks.push(current.trim());
      current = "";
    }
    current += s + ". ";
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function embedAndInsert(businessId, text) {
  const chunks = chunkText(text);

  // >>> Story 2.8 addition — determine embedding space for this business
  const embeddingSpaceId = await getOrCreateEmbeddingSpace(businessId);
  console.log(`🔹 Using embedding_space_id=${embeddingSpaceId} for business_id=${businessId}`);
  // <<<

  for (const chunk of chunks) {
    if (chunk.trim().length === 0) continue;

    // Generate embedding
    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunk,
    });

    const vector = emb.data[0].embedding;

    // Insert into DB
    // Convert JS array to Postgres vector literal: {0.1,0.2,0.3,...}
    // PGVector requires square bracket format: [0.1,0.2,0.3,...]
    const vectorLiteral = "[" + vector.join(",") + "]";

    // >>> Story 2.8 addition — include embedding_space_id column
    await db.query(
      "INSERT INTO kb_entries (business_id, question, answer, embedding, embedding_space_id) VALUES ($1, $2, $3, $4::vector, $5)",
      [businessId, chunk, chunk, vectorLiteral, embeddingSpaceId]
    );
    // <<<

    console.log("✅ Inserted chunk:", chunk.substring(0, 50) + "...");
  }
}

async function run() {
  await db.connect();
  console.log("✅ Connected to Postgres");

  // Example: ingest from TXT
  if (fs.existsSync("sample_faq.txt")) {
    const txt = fs.readFileSync("sample_faq.txt", "utf-8");
    await embedAndInsert(1, txt);
  }

  // Example: ingest from PDF
  if (fs.existsSync("sample_faq.pdf")) {
    const pdfBuffer = fs.readFileSync("sample_faq.pdf");
    const pdfData = await pdfParse(pdfBuffer);
    await embedAndInsert(1, pdfData.text);
  }

  await db.end();
  console.log("🎯 Ingestion completed.");
}

run().catch(err => console.error("❌ Error:", err));
