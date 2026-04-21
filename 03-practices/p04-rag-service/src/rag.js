const VectorStore = require('./vector-store');

class RAGService {
  constructor(options = {}) {
    this.vectorStore = new VectorStore();
    this.llmProvider = options.llmProvider || this.mockLLM.bind(this);
  }

  async addDocuments(docs) {
    this.vectorStore.addDocuments(docs);
  }

  async query(question, topK = 3) {
    const results = this.vectorStore.search(question, topK);
    
    const context = results
      .filter(r => r.score > 0.1)
      .map(r => r.document.text)
      .join('\n');

    const prompt = this.buildPrompt(question, context);
    const answer = await this.llmProvider(prompt, context);

    return {
      question,
      answer,
      context,
      sources: results.filter(r => r.score > 0.1).map(r => r.id)
    };
  }

  buildPrompt(question, context) {
    if (!context) {
      return `Question: ${question}\n\nAnswer based on your knowledge:`;
    }
    return `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer based on the context:`;
  }

  async mockLLM(prompt, context) {
    // Mock LLM response - in production, integrate with OpenAI, Anthropic, etc.
    if (context) {
      return `Based on the provided context: ${context.substring(0, 50)}...`;
    }
    return 'I do not have enough information to answer this question.';
  }

  clear() {
    this.vectorStore.clear();
  }
}

module.exports = RAGService;
