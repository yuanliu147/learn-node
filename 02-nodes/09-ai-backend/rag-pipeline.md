# RAG Pipeline（检索增强生成）

## 概念

Retrieval-Augmented Generation（RAG，检索增强生成）将文档检索与 LLM 生成相结合。当查询进来时，系统首先从知识库中检索相关上下文，然后将该上下文包含在 LLM prompt 中，以产生有依据的、准确的响应。

```
查询 → 检索 Top-K → 与 Prompt 组合 → 生成 → 响应
```

## Pipeline 架构

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

## 索引 Pipeline

### 文档摄取

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
    // 分块文档
    const chunks = chunkDocument(doc);
    
    // 对 chunks 进行嵌入
    const embeddings = await embedder.embed(chunks.map(c => c.content));
    
    // 存储到向量数据库
    await vectorDB.upsert({
      ids: chunks.map(c => c.id),
      embeddings,
      documents: chunks.map(c => c.content),
      metadatas: chunks.map(c => c.metadata)
    });
  }
}
```

### 分块策略

```typescript
// 简单的固定大小分块
function chunkBySize(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

// 按句子语义分块
function chunkBySentences(text: string, maxSentences = 5): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const chunks: string[] = [];
  
  for (let i = 0; i < sentences.length; i += maxSentences) {
    chunks.push(sentences.slice(i, i + maxSentences).join(' '));
  }
  return chunks;
}

// 递归字符分割
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

## 检索 Pipeline

### 查询处理

```typescript
class RetrievalPipeline {
  constructor(
    private embedder: Embedder,
    private vectorDB: VectorDB,
    private reranker?: Reranker
  ) {}
  
  async retrieve(query: string, topK = 5): Promise<RetrievedChunk[]> {
    // 生成查询嵌入
    const [queryEmbedding] = await this.embedder.embed(query);
    
    // 向量相似度搜索
    let results = await this.vectorDB.search({
      embedding: queryEmbedding,
      topK: topK * 4,  // 为重排序多获取一些
      includeMetadata: true
    });
    
    // 可选：对结果进行重排序
    if (this.reranker) {
      results = await this.reranker.rerank(query, results, topK);
    }
    
    // 按相关性阈值过滤
    return results.filter(r => r.score > 0.7);
  }
}
```

### 混合搜索

```typescript
async hybridSearch(query: string, topK = 5) {
  // 1. 使用嵌入的语义搜索
  const semanticResults = await this.vectorDB.search({
    embedding: await this.embedder.embed(query),
    topK: topK * 2
  });
  
  // 2. 关键词搜索（BM25）
  const keywordResults = await this.bm25Index.search(query, topK * 2);
  
  // 3. 互惠排名融合
  const fused = reciprocalRankFusion(
    semanticResults,
    keywordResults,
    k: 60  // RRF 常数
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

## 生成 Pipeline

### 上下文组装

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
  // 1. 检索相关 chunks
  const chunks = await retriever.retrieve(query);
  
  if (chunks.length === 0) {
    return { content: 'No relevant context found.', sources: [] };
  }
  
  // 2. 构建上下文字符串
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join('\n\n');
  
  // 3. 生成响应
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

## 评估

### RAGAS 指标

```typescript
interface RAGEvaluation {
  faithfulness: number;     // 答案是否与上下文一致？
  answerRelevancy: number;  // 答案是否与查询相关？
  contextPrecision: number;  // 检索的 chunks 是否相关？
  contextRecall: number;     // 是否检索到所有相关 chunks？
}

async function evaluateRAG(
  query: string,
  answer: string,
  retrievedChunks: RetrievedChunk[],
  groundTruth?: string
): Promise<RAGEvaluation> {
  // Faithfulness：检查答案事实是否存在于上下文中
  const faithfulnessPrompt = `Given a context and answer, score faithfulness 0-1...`;
  
  // Answer Relevancy：答案是否回答了问题？
  const relevancyPrompt = `Given a question and answer, score relevancy 0-1...`;
  
  // 可以从 chunk 分数计算上下文精确率/召回率
  return {
    faithfulness: await score(faithfulnessPrompt),
    answerRelevancy: await score(relevancyPrompt),
    contextPrecision: computePrecision(retrievedChunks),
    contextRecall: groundTruth ? computeRecall(retrievedChunks, groundTruth) : 0
  };
}
```

## 总结

RAG pipeline 将检索和生成结合，用于产生有依据的 AI 响应：
1. **索引**：将文档分块、嵌入、存储到向量数据库
2. **检索**：查询嵌入 + 混合搜索 + 重排序
3. **生成**：组装上下文 + prompt + LLM 调用
4. **评估**：测量忠诚度、相关性、精确率、召回率
