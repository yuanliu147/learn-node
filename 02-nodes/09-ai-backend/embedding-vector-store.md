# Embedding 与向量存储

## 概念

Embedding 将文本转换为密集向量，捕捉语义含义。向量数据库存储这些 embedding 并支持相似性搜索——通过比较向量距离来查找与给定查询最相关的文档。

## Embedding 生成

### Embedding 模型

```typescript
interface EmbeddingModel {
  name: string;
  dimensions: number;
  maxTokens: number;
  normalize: boolean;  // 输出是否为单位归一化
}

const EMBEDDING_MODELS = {
  'text-embedding-3-small': { dimensions: 1536, maxTokens: 8191 },
  'text-embedding-3-large': { dimensions: 3072, maxTokens: 8191 },
  'text-embedding-ada-002': { dimensions: 1536, maxTokens: 8191 }
} as const;

// OpenAI 的 embedding 已归一化为单位长度（L2）
```

### 生成 Embedding

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
  
  // 大规模语料库的批量 embedding
  async embedBatch(texts: string[], batchSize = 100): Promise<number[][]> {
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await this.embed(batch);
      results.push(...embeddings);
      
      // 友好于速率限制
      await this.delay(100);
    }
    
    return results;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 本地 Embedding 模型

```typescript
// 使用 transformers.js 进行本地 embedding
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

## 向量存储接口

```typescript
interface VectorStore {
  // 核心操作
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
  
  // 管理
  getStats(): Promise<StoreStats>;
}

interface SearchResult {
  id: string;
  score: number;  // 相似度分数
  content?: string;
  metadata?: Record<string, any>;
}
```

## 距离度量

```typescript
// 余弦相似度（embedding 最常用）
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

// 欧几里得距离
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// 点积（未归一化）
function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, ai, i) => sum + ai * b[i], 0);
}
```

## 内存向量存储

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

## 向量索引策略

### HNSW（分层可导航小世界）

```typescript
// HNSW 是一种基于图的索引，用于快速近似最近邻搜索
class HNSWIndex {
  private levels: Array<Map<string, number[]>> = [];
  private entryPoint: string;
  private m: number = 16;  // 每个节点的连接数
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
    
    // 从顶层向下搜索
    for (let l = this.levels.length - 1; l >= 0; l--) {
      current = this.searchLevel(query, current, this.levels[l]);
    }
    
    // 使用束搜索收集 k 个最近邻
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
    // 最终结果的束搜索实现
    return [];
  }
}
```

## 流行的向量数据库

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

## 降维

```typescript
// PCA 用于减少 embedding 维度
function pca(vectors: number[][], targetDimensions: number): number[][] {
  const n = vectors.length;
  const m = vectors[0].length;
  
  // 中心化数据
  const mean = vectors[0].map((_, i) => 
    vectors.reduce((sum, v) => sum + v[i], 0) / n
  );
  
  const centered = vectors.map(v => v.map((val, i) => val - mean[i]));
  
  // 计算协方差矩阵（简化 - 生产环境使用实际的 PCA 库）
  // ... 计算特征向量 ...
  
  // 投影到前 k 个特征向量
  // 这是简化的占位符
  return centered.map(v => v.slice(0, targetDimensions));
}

// 对于非常高的维度，使用随机投影（更快）
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
    // 归一化
    const norm = Math.sqrt(result.reduce((sum, x) => sum + x * x, 0));
    return result.map(x => x / norm);
  });
}
```

## 总结

Embedding 和向量存储是 AI 后端的基础：

1. **Embedding**：使用如 text-embedding-3 等模型将文本转换为语义向量
2. **距离度量**：余弦相似度、欧几里得距离、点积
3. **向量存储**：内存型、Pinecone、Weaviate、Qdrant
4. **索引**：HNSW 用于快速近似最近邻搜索
5. **优化**：批量 embedding、维度 reduction 以实现规模化
