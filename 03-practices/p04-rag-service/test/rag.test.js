const assert = require('assert');
const RAGService = require('../src/rag');
const VectorStore = require('../src/vector-store');
const { computeEmbedding, cosineSimilarity, tokenize } = require('../src/embedder');

describe('RAG Service', () => {
  let rag;

  beforeEach(() => {
    rag = new RAGService();
  });

  afterEach(() => {
    rag.clear();
  });

  describe('VectorStore', () => {
    it('should add and retrieve documents', () => {
      const store = new VectorStore();
      store.addDocument('1', 'Hello world');
      
      assert.strictEqual(store.size(), 1);
      assert.strictEqual(store.getDocument('1').text, 'Hello world');
    });

    it('should search by similarity', () => {
      const store = new VectorStore();
      store.addDocument('1', 'Node.js is fast');
      store.addDocument('2', 'Python is popular');
      store.addDocument('3', 'JavaScript runs everywhere');
      
      const results = store.search('JavaScript programming');
      
      assert.strictEqual(results.length, 3);
      assert.strictEqual(results[0].id, '3');
      assert.ok(results[0].score > 0);
    });
  });

  describe('Embedder', () => {
    it('should tokenize text', () => {
      const tokens = tokenize('Hello World Hello');
      assert.deepStrictEqual(tokens, ['hello', 'world', 'hello']);
    });

    it('should compute embeddings', () => {
      const embedding = computeEmbedding('hello world hello');
      assert.ok(embedding.hello > embedding.world);
    });

    it('should compute cosine similarity', () => {
      const sim = cosineSimilarity(
        { a: 1, b: 0.5 },
        { a: 1, b: 0.5 }
      );
      assert.strictEqual(sim, 1);
    });
  });

  describe('RAGService', () => {
    it('should add documents', async () => {
      await rag.addDocuments([
        { id: '1', text: 'Node.js uses V8 engine' },
        { id: '2', text: 'npm is the package manager' }
      ]);
      
      assert.strictEqual(rag.vectorStore.size(), 2);
    });

    it('should query with context', async () => {
      await rag.addDocuments([
        { id: '1', text: 'Node.js is a JavaScript runtime' },
        { id: '2', text: 'V8 compiles JavaScript to machine code' }
      ]);

      const result = await rag.query('What is Node.js?');
      
      assert.ok(result.answer);
      assert.ok(result.context.includes('Node.js'));
      assert.ok(result.sources.length > 0);
    });

    it('should return empty context for unrelated queries', async () => {
      await rag.addDocuments([
        { id: '1', text: 'Apple is a fruit' }
      ]);

      const result = await rag.query('What is Node.js?');
      
      assert.ok(result.sources.length === 0 || result.score <= 0.1);
    });
  });
});
