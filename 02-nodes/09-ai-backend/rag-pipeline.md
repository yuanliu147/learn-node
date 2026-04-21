# RAG Pipeline

## Concept

Retrieval-Augmented Generation (RAG) combines document retrieval with LLM generation. When a query comes in, the system first retrieves relevant context from a knowledge base, then includes that context in the LLM prompt to produce grounded, accurate responses.

```
Query → Retrieve Top-K → Combine with Prompt → Generate → Response
```

## Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        RAG PIPELINE                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐    ┌─────────────┐    ┌───────────────────┐   │
│  │ QUERY   │───>│ RETRIEVAL   │───>│ CONTEXT ASSEMBLY  │   │
│  │ INGEST  │    │ (Vector DB) │    │ (Rank & Filter)   │   │
│  └─────────┘    └─────────────┘    └─────────┬─────────┘   │
│       │                                       │             │
│       │                                       ▼             │
│       │                              ┌───────────────────┐   │
│       │                              │    LLM GENERATE   │   │
│       │                              └─────────┬─────────┘   │
│       │                                        │             │
│       ▼                                        ▼             │
│  ┌─────────────┐                        ┌───────────┐        │
│  │  CHUNKING   │                        │ RESPONSE  │        │
│  │  & EMBEDDING│                        │  OUTPUT   │        │
│  └─────────────┘                        └───────────┘        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Indexing Pipeline

### Document Ingestion

```typescript
interface Document {
  id: string;
  content: string;
  metadata: {
    source: string;
    createdAt: Date;
    author?: string;
    [key: string]: any;
  };
}

async function ingestDocuments(docs: Document[], embedder: Embedder) {
  for (const doc of docs) {
    // Chunk document
    const chunks = chunkDocument(doc);
    
    // Embed chunks
    const embeddings = await embedder.embed(chunks.map(c => c.content));
    
    // Store in vector DB
    await vectorDB.upsert({
      ids: chunks.map(c => c.id),
      embeddings,
      documents: chunks.map(c => c.content),
      metadatas: chunks.map(c => c.metadata)
    });
  }
}
```

### Chunking Strategies

```typescript
// Simple fixed-size chunking
function chunkBySize(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

// Semantic chunking by sentences
function chunkBySentences(text: string, maxSentences = 5): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const chunks: string[] = [];
  
  for (let i = 0; i < sentences.length; i += maxSentences) {
    chunks.push(sentences.slice(i, i + maxSentences).join(' '));
  }
  return chunks;
}

// Recursive character splitting
function recursiveChunk(text: string, separators = ['\n\n', '\n', '. '], minLength = 100): string[] {
  if (text.length <= minLength) return [text];
  
  for (const sep of separators) {
    const parts = text.split(sep);
    if (parts.length > 1) {
      return parts.flatMap(p => recursiveChunk(p, separators.slice(1), minLength));
    }
  }
  return [text];
}
```

## Retrieval Pipeline

### Query Processing

```typescript
class RetrievalPipeline {
  constructor(
    private embedder: Embedder,
    private vectorDB: VectorDB,
    private reranker?: Reranker
  ) {}
  
  async retrieve(query: string, topK = 5): Promise<RetrievedChunk[]> {
    // Generate query embedding
    const [queryEmbedding] = await this.embedder.embed(query);
    
    // Vector similarity search
    let results = await this.vectorDB.search({
      embedding: queryEmbedding,
      topK: topK * 4,  // Fetch more for reranking
      includeMetadata: true
    });
    
    // Optional: Rerank results
    if (this.reranker) {
      results = await this.reranker.rerank(query, results, topK);
    }
    
    // Filter by relevance threshold
    return results.filter(r => r.score > 0.7);
  }
}
```

### Hybrid Search

```typescript
async hybridSearch(query: string, topK = 5) {
  // 1. Semantic search with embeddings
  const semanticResults = await this.vectorDB.search({
    embedding: await this.embedder.embed(query),
    topK: topK * 2
  });
  
  // 2. Keyword search (BM25)
  const keywordResults = await this.bm25Index.search(query, topK * 2);
  
  // 3. Reciprocal Rank Fusion
  const fused = reciprocalRankFusion(
    semanticResults,
    keywordResults,
    k: 60  // RRF constant
  );
  
  return fused.slice(0, topK);
}

function reciprocalRankFusion(resultsA: Result[], resultsB: Result[], k = 60): Result[] {
  const scores = new Map<string, number>();
  
  for (const r of resultsA) {
    scores.set(r.id, scores.get(r.id) || 0 + 1 / (k + r.rank));
  }
  
  for (const r of resultsB) {
    scores.set(r.id, scores.get(r.id) || 0 + 1 / (k + r.rank));
  }
  
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}
```

## Generation Pipeline

### Context Assembly

```typescript
interface RAGPrompt {
  system: string;
  context: string;
  query: string;
}

function buildRAGPrompt(prompt: RAGPrompt): string {
  return `
${prompt.system}

CONTEXT:
${prompt.context}

USER QUERY: ${prompt.query}

Based on the context above, answer the user's query. If the context doesn't contain relevant information, say so.
`.trim();
}

async function generateWithRAG(
  query: string,
  retriever: RetrievalPipeline,
  llm: LLMAdapter
): Promise<GenerationResult> {
  // 1. Retrieve relevant chunks
  const chunks = await retriever.retrieve(query);
  
  if (chunks.length === 0) {
    return { content: 'No relevant context found.', sources: [] };
  }
  
  // 2. Build context string
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join('\n\n');
  
  // 3. Generate response
  const prompt = buildRAGPrompt({
    system: 'You are a helpful assistant. Use the provided context to answer questions.',
    context,
    query
  });
  
  const result = await llm.generate(prompt);
  
  return {
    content: result.content,
    sources: chunks.map(c => c.metadata)
  };
}
```

## Evaluation

### RAGAS Metrics

```typescript
interface RAGEvaluation {
  faithfulness: number;    // Does answer match context?
  answerRelevancy: number; // Is answer relevant to query?
  contextPrecision: number;// Are retrieved chunks relevant?
  contextRecall: number;   // Are all relevant chunks retrieved?
}

async function evaluateRAG(
  query: string,
  answer: string,
  retrievedChunks: RetrievedChunk[],
  groundTruth?: string
): Promise<RAGEvaluation> {
  // Faithfulness: Check if answer facts exist in context
  const faithfulnessPrompt = `Given a context and answer, score faithfulness 0-1...`;
  
  // Answer Relevancy: Does answer address the question?
  const relevancyPrompt = `Given a question and answer, score relevancy 0-1...`;
  
  // Can compute context precision/recall from chunk scores
  return {
    faithfulness: await score(faithfulnessPrompt),
    answerRelevancy: await score(relevancyPrompt),
    contextPrecision: computePrecision(retrievedChunks),
    contextRecall: groundTruth ? computeRecall(retrievedChunks, groundTruth) : 0
  };
}
```

## Summary

RAG pipelines combine retrieval and generation for grounded AI responses:
1. **Indexing**: Chunk documents, embed, store in vector DB
2. **Retrieval**: Query embedding + hybrid search + reranking
3. **Generation**: Assemble context + prompt + LLM call
4. **Evaluation**: Measure faithfulness, relevance, precision, recall
