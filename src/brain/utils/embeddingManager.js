// ===============================================
// src/brain/utils/embeddingManager.js
// Temporary stub until full embedding manager is implemented
// ===============================================
async function getOrCreateEmbeddingSpace(businessId) {
  // TODO: connect to your PG + pgvector embedding space table
  // For now just return 1 as default space
  return 1;
}

module.exports = { getOrCreateEmbeddingSpace };
