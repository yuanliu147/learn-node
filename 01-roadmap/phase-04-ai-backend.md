---
phase: 04
name: AI 后端专项
duration: 2-3 周
prerequisites: ["phase-03-framework"]
next_phase: phase-05-performance
version: 1.0
last_updated: 2026-04-21
---

# Phase 04: AI 后端专项

## 学习目标

完成本阶段后，你应该能够：
- [ ] 理解 SSE（Server-Sent Events）原理并实现流式响应
- [ ] 设计一个多 LLM Provider 适配器
- [ ] 理解 RAG（Retrieval-Augmented Generation）流水线
- [ ] 实现 Embedding 生成和向量存储检索
- [ ] 实现并发控制和 Token 限流
- [ ] 理解并防御 Prompt 注入攻击

## 知识点清单

| # | 知识点 | 难度 | 节点文件 | 预计时间 |
|---|--------|------|----------|----------|
| 1 | SSE 流式响应 | L3 | [sse-streaming](../02-nodes/09-ai-backend/sse-streaming.md) | 3h |
| 2 | LLM Provider 适配器 | L3 | [llm-provider-adapter](../02-nodes/09-ai-backend/llm-provider-adapter.md) | 4h |
| 3 | RAG 流水线 | L4 | [rag-pipeline](../02-nodes/09-ai-backend/rag-pipeline.md) | 4h |
| 4 | Embedding 与向量存储 | L3 | [embedding-vector-store](../02-nodes/09-ai-backend/embedding-vector-store.md) | 3h |
| 5 | 并发控制 | L4 | [concurrency-control](../02-nodes/09-ai-backend/concurrency-control.md) | 3h |
| 6 | Token 限流 | L4 | [token-rate-limit](../02-nodes/09-ai-backend/token-rate-limit.md) | 3h |
| 7 | Prompt 注入防御 | L4 | [prompt-injection-defense](../02-nodes/09-ai-backend/prompt-injection-defense.md) | 3h |

## 实践任务

- [ ] **项目 P1**: 实现一个 LLM 代理网关，支持 OpenAI/Anthropic/本地模型
- [ ] **项目 P2**: 实现一个 RAG 服务，支持文档解析、Embedding、向量检索
- [ ] **项目 P3**: 实现一个 AI Chat 服务，支持多轮对话、流式响应、并发控制

## 验收标准

1. 能够解释 SSE 和 WebSocket 的区别及适用场景
2. 能够设计一个支持多 Provider 的 LLM 适配器
3. 能够实现一个完整的 RAG 流水线
4. 能够实现 Token 限流和并发控制
5. 能够识别和防御常见的 Prompt 注入
6. 通过本阶段的模拟面试

## 继续学习

完成 Phase 4 后，你可以进入 [Phase 5: 性能优化](phase-05-performance.md)

---

*版本: 1.0 | 最后更新: 2026-04-21*
