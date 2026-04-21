const { computeEmbedding, cosineSimilarity } = require('./embedder');

class VectorStore {
  constructor() {
    this.documents = new Map();
    this.embeddings = new Map();
  }

  addDocument(id, text, metadata = {}) {
    this.documents.set(id, { id, text, metadata });
    this.embeddings.set(id, computeEmbedding(text));
  }

  addDocuments(docs) {
    docs.forEach(doc => {
      const { id, text, ...metadata } = doc;
      this.addDocument(id, text, metadata);
    });
  }

  search(query, topK = 5) {
    const queryEmbedding = computeEmbedding(query);
    const results = [];

    for (const [id, embedding] of this.embeddings) {
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      results.push({
        id,
        document: this.documents.get(id),
        score: similarity
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  getDocument(id) {
    return this.documents.get(id);
  }

  clear() {
    this.documents.clear();
    this.embeddings.clear();
  }

  size() {
    return this.documents.size;
  }
}

module.exports = VectorStore;
