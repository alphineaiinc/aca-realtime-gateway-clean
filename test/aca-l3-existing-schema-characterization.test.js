"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Static compatibility contract: deliberately does not connect to production DB.
// These checks expose drift against the 2026-11-23 read-only Neon schema snapshot.
// Replace the source-pattern assertions with runtime mocked DB tests when fixes land.
const source = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const known = {
  master_tenants: ["id", "business_name", "preferred_lang", "region"],
  kb_entries: ["id", "tenant_id", "query_text", "answer", "embedding"],
  tenant_voice_profile: ["id", "tenant_id", "lang_code", "voice_id", "tone_preset", "stability", "similarity_boost", "speaking_rate", "region_code", "updated_at", "tts_provider", "language_code", "style", "pitch_shift", "use_speaker_boost", "created_at"],
};
test("known Neon schema contract includes canonical tenant and knowledge columns", () => {
  assert.ok(known.master_tenants.includes("business_name"));
  assert.ok(known.kb_entries.includes("tenant_id"));
  assert.ok(known.kb_entries.includes("query_text"));
  assert.ok(known.kb_entries.includes("answer"));
});
test("knowledge retrieval path reads canonical tenant-scoped KB columns", () => {
  const brain = source("src/routes/brain.js");
  assert.match(brain, /FROM kb_entries/);
  assert.match(brain, /WHERE tenant_id = \$2/);
  assert.match(brain, /query_text AS question/);
});
test("remaining upload and embedding-space drift is characterized", () => {
  const upload = source("src/routes/uploadKnowledge.js");
  const tenant = source("src/routes/tenant.js");
  const embedding = source("src/brain/utils/embeddingManager.js");
  // These are characterization assertions, NOT desired behavior. Remove when reconciled.
  assert.match(upload, /INSERT INTO kb_entries \(business_id, content, embedding, source_filename, chunk_index, created_at\)/);
  assert.doesNotMatch(tenant, /INSERT INTO businesses/);
  assert.match(tenant, /INSERT INTO master_tenants \(business_name, preferred_lang, region\)/);
  assert.match(embedding, /FROM embedding_spaces/);
});

test("nearest embedding lookup uses tenant ID and live KB column names", () => {
  const embedding = source("src/brain/utils/embeddingManager.js");
  const fn = embedding.slice(embedding.indexOf("async function getNearestEmbeddingsForBusiness("));
  assert.match(fn, /SELECT id, query_text AS question, answer, embedding/);
  assert.match(fn, /WHERE tenant_id = \$1/);
  assert.match(fn, /embedding <-> \$2::vector/);
  assert.doesNotMatch(fn, /WHERE business_id =/);
});

test("provisioning uses one transaction connection and blocks tenant-id-only login", () => {
  const tenant = source("src/routes/tenant.js");
  assert.match(tenant, /const client = await pool.connect\(\)/);
  assert.match(tenant, /await client.query\("BEGIN"\)/);
  assert.match(tenant, /await client.query\("COMMIT"\)/);
  assert.match(tenant, /client.release\(\)/);
  assert.match(tenant, /verified_login_required/);
  assert.doesNotMatch(tenant, /jwt.sign\(/);
  assert.match(tenant, /business_name, preferred_lang, region/);
  assert.match(tenant, /SELECT id AS tenant_id, business_name, preferred_lang, region/);
});
