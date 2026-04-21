# Embedding & Vector Store

## Concept

Embeddings convert text into dense vectors that capture semantic meaning. Vector databases store these embeddings and enable similarity search - finding the most relevant documents for a given query by comparing vector distances.

## Embedding Generation

### Embedding Models

```typescript
interface EmbeddingModel {
  name: string;
  dimensions: number;
  maxTokens: number;
  normalize: boolean;  // Whether output is unit-normalized
}

const EMBEDDING_MODELS = {
  'text-embedding-3-small': { dimensions: 1536, maxTokens: 8191 },
  'text-embedding-3-large': { dimensions: 3072, maxTokens: 8191 },
  'text-embedding-ada-002': { dimensions: 1536, maxTokens: 8191 }
} as const;

// OpenAI embeddings are normalized to unit length (L2)
```

### Generating Embeddings

```typescript
class EmbeddingService {
  constructor(private adapter: LLMAdapter) {}
  
  async embed(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: inputs
      })
    });
    
    const data = await response.json();
    return data.data.map((item: any) => item.embedding);
  }
  
  // Batch embedding for large corpora
  async embedBatch(texts: string[], batchSize = 100): Promise<number[][]> {
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await this.embed(batch);
      results.push(...embeddings);
      
      // Rate limit friendly
      await this.delay(100);
    }
    
    return results;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Local Embedding Models

```typescript
// Using transformers.js for local embeddings
import { pipeline } from '@xenova/transformers';

class LocalEmbeddingService {
  private embedder: any;
  
  async initialize() {
    this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  
  async embed(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    
    const results = await Promise.all(
      inputs.map(async (t) => {
        const output = await this.embedder(t, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
      })
    );
    
    return results;
  }
}
```

## Vector Store Interface

```typescript
interface VectorStore {
  // Core operations
  upsert(data: {
    ids: string[];
    embeddings: number[][];
    documents: string[];
    metadatas?: Record<string, any>[];
  }): Promise<void>;
  
  search(query: {
    embedding: number[];
    topK: number;
    filter?: Record<string, any>;
    includeMetadata?: boolean;
  }): Promise<SearchResult[]>;
  
  delete(ids: string[]): Promise<void>;
  
  // Management
  getStats(): Promise<StoreStats>;
}

interface SearchResult {
  id: string;
  score: number;  // Similarity score
  content?: string;
  metadata?: Record<string, any>;
}
```

## Distance Metrics

```typescript
// Cosine similarity (most common for embeddings)
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Euclidean distance
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// Dot product (unnormalized)
function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, ai, i) => sum + ai * b[i], 0);
}
```

## In-Memory Vector Store

```typescript
class InMemoryVectorStore implements VectorStore {
  private vectors: Map<string, {
    embedding: number[];
    document: string;
    metadata: Record<string, any>;
  }> = new Map();
  
  private embeddingIndex: number[][] = [];
  private idIndex: string[] = [];
  
  async upsert(data: {
    ids: string[];
    embeddings: number[][];
    documents: string[];
    metadatas?: Record<string, any>[];
  }): Promise<void> {
    for (let i = 0; i < data.ids.length; i++) {
      this.vectors.set(data.ids[i], {
        embedding: data.embeddings[i],
        document: data.documents[i],
        metadata: data.metadatas?.[i] || {}
      });
      
      this.embeddingIndex.push(data.embeddings[i]);
      this.idIndex.push(data.ids[i]);
    }
  }
  
  async search(query: {
    embedding: number[];
    topK: number;
    filter?: Record<string, any>;
    includeMetadata?: boolean;
  }): Promise<SearchResult[]> {
    const scores = this.embeddingIndex.map((embedding, idx) => ({
      id: this.idIndex[idx],
      score: cosineSimilarity(query.embedding, embedding),
      document: this.vectors.get(this.idIndex[idx])?.document,
      metadata: this.vectors.get(this.idIndex[idx])?.metadata
    }));
    
    return scores
      .filter(r => !query.filter || this.matchesFilter(r.metadata, query.filter))
      .sort((a, b) => b.score - a.score)
      .slice(0, query.topK);
  }
  
  private matchesFilter(metadata: any, filter: Record<string, any>): boolean {
    return Object.entries(filter).every(([key, value]) => metadata[key] === value);
  }
  
  async delete(ids: string[]): Promise<void> {
    const toRemove = new Set(ids);
    const newEmbeddingIndex: number[][] = [];
    const newIdIndex: string[] = [];
    
    for (let i = 0; i < this.idIndex.length; i++) {
      if (!toRemove.has(this.idIndex[i])) {
        newEmbeddingIndex.push(this.embeddingIndex[i]);
        newIdIndex.push(this.idIndex[i]);
      } else {
        this.vectors.delete(this.idIndex[i]);
      }
    }
    
    this.embeddingIndex = newEmbeddingIndex;
    this.idIndex = newIdIndex;
  }
  
  async getStats(): Promise<StoreStats> {
    return {
      count: this.vectors.size,
      dimensions: this.embeddingIndex[0]?.length || 0
    };
  }
}
```

## Vector Indexing Strategies

### HNSW (Hierarchical Navigable Small World)

```typescript
// HNSW is a graph-based index for fast approximate nearest neighbor search
class HNSWIndex {
  private levels: Array<Map<string, number[]>> = [];
  private entryPoint: string;
  private m: number = 16;  // Connections per node
  private maxLevel: number = 6;
  
  constructor(dimensions: number) {
    this.entryPoint = null;
  }
  
  addNode(id: string, embedding: number[], level?: number) {
    const nodeLevel = level ?? Math.floor(-Math.log(Math.random()) * this.maxLevel);
    
    for (let l = 0; l <= nodeLevel; l++) {
      if (!this.levels[l]) this.levels[l] = new Map();
      this.levels[l].set(id, embedding);
    }
  }
  
  search(query: number[], k: number): string[] {
    let current = this.entryPoint;
    
    // Search from top level down
    for (let l = this.levels.length - 1; l >= 0; l--) {
      current = this.searchLevel(query, current, this.levels[l]);
    }
    
    // Collect k nearest using beam search
    return this.beamSearch(query, k);
  }
  
  private searchLevel(query: number[], start: string, level: Map<string, number[]>): string {
    let best = start;
    let bestScore = cosineSimilarity(query, level.get(start));
    
    for (const [id, embedding] of level) {
      const score = cosineSimilarity(query, embedding);
      if (score > bestScore) {
        best = id;
        bestScore = score;
      }
    }
    
    return best;
  }
  
  private beamSearch(query: number[], k: number): string[] {
    // Implementation of beam search for final results
    return [];
  }
}
```

## Popular Vector Databases

```typescript
// Pinecone
class PineconeStore implements VectorStore {
  constructor(private apiKey: string, private environment: string) {}
  
  async upsert(data: any): Promise<void> {
    await fetch(`https://${this.environment}/vectors/upsert`, {
      method: 'POST',
      headers: {
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vectors: data })
    });
  }
  
  async search(query: any): Promise<SearchResult[]> {
    const response = await fetch(`https://${this.environment}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    });
    
    return response.json();
  }
}

// Weaviate
class WeaviateStore implements VectorStore {
  constructor(private client: any) {}
  
  async upsert(data: any): Promise<void> {
    const batch = this.client.batch.objectsBatcher();
    
    for (let i = 0; i < data.ids.length; i++) {
      batch.add({
        class: 'Document',
        id: data.ids[i],
        vector: data.embeddings[i],
        properties: {
          content: data.documents[i],
          ...data.metadatas?.[i]
        }
      });
    }
    
    await batch.do();
  }
}

// Qdrant
class QdrantStore implements VectorStore {
  constructor(private url: string, private collection: string) {}
  
  async upsert(data: any): Promise<void> {
    await fetch(`${this.url}/collections/${this.collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: data.ids.map((id: string, i: number) => ({
          id,
          vector: data.embeddings[i],
          payload: { content: data.documents[i], ...data.metadatas?.[i] }
        }))
      })
    });
  }
}
```

## Dimensionality Reduction

```typescript
// PCA for reducing embedding dimensions
function pca(vectors: number[][], targetDimensions: number): number[][] {
  const n = vectors.length;
  const m = vectors[0].length;
  
  // Center the data
  const mean = vectors[0].map((_, i) => 
    vectors.reduce((sum, v) => sum + v[i], 0) / n
  );
  
  const centered = vectors.map(v => v.map((val, i) => val - mean[i]));
  
  // Compute covariance matrix (simplified - use actual PCA lib for production)
  // ... compute eigenvectors ...
  
  // Project onto top k eigenvectors
  // This is a simplified placeholder
  return centered.map(v => v.slice(0, targetDimensions));
}

// For very high dimensions, use random projection (faster)
function randomProjection(vectors: number[][], targetDimensions: number): number[][] {
  const m = vectors[0].length;
  const projectionMatrix = Array.from({ length: m }, () =>
    Array.from({ length: targetDimensions }, () => Math.random() * 2 - 1)
  );
  
  return vectors.map(v => {
    const result = new Array(targetDimensions).fill(0);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < targetDimensions; j++) {
        result[j] += v[i] * projectionMatrix[i][j];
      }
    }
    // Normalize
    const norm = Math.sqrt(result.reduce((sum, x) => sum + x * x, 0));
    return result.map(x => x / norm);
  });
}
```

## Summary

Embedding and vector stores are foundational to AI backends:
1. **Embeddings**: Convert text to semantic vectors using models like text-embedding-3
2. **Distance metrics**: Cosine similarity, Euclidean, dot product
3. **Vector stores**: In-memory, Pinecone, Weaviate, Qdrant
4. **Indexing**: HNSW for fast approximate nearest neighbor search
5. **Optimization**: Batch embedding, dimensionality reduction for scale
