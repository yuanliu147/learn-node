/**
 * Simple embedding implementation using TF-IDF-like approach
 * In production, use OpenAI embeddings or similar
 */

function tokenize(text) {
  return text.toLowerCase().split(/\s+/).filter(t => t.length > 0);
}

function computeEmbedding(text) {
  const tokens = tokenize(text);
  const tokenFreq = {};
  
  tokens.forEach(token => {
    tokenFreq[token] = (tokenFreq[token] || 0) + 1;
  });

  // Normalize frequencies
  const embedding = {};
  const maxFreq = Math.max(...Object.values(tokenFreq), 1);
  
  for (const [token, freq] of Object.entries(tokenFreq)) {
    embedding[token] = freq / maxFreq;
  }
  
  return embedding;
}

function cosineSimilarity(a, b) {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (const key of allKeys) {
    const valA = a[key] || 0;
    const valB = b[key] || 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
}

module.exports = {
  computeEmbedding,
  cosineSimilarity,
  tokenize
};
