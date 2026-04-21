# 实践项目 (Practice Projects)

> 通过动手实践巩固所学知识

## 总览

| 项目 | 名称 | 难度 | 预计时间 | 关联阶段 |
|------|------|------|----------|----------|
| [P01](p01-semaphore/) | 并发控制信号量 | L3 | 1 天 | Phase 1-2 |
| [P02](p02-transform-stream/) | 自定义 Transform 流 | L3 | 1 天 | Phase 2 |
| [P03](p03-llm-proxy/) | LLM 代理网关 | L3-L4 | 2 天 | Phase 4 |
| [P04](p04-rag-service/) | RAG 服务 | L4 | 2-3 天 | Phase 4 |
| [P05](p05-worker-pool/) | Worker 线程池 | L4 | 2 天 | Phase 6 |
| [P06](p06-native-addon/) | C++ 原生模块 | L4-L5 | 2-3 天 | Phase 6 |

---

## 项目详情

### P01: 并发控制信号量

**目标**: 实现一个基于 Promise 的 Semaphore，用于限制同时执行的异步任务数。

**应用场景**:
- AI 后端中限制同时调用的 LLM API 数量
- 防止并发过大导致内存爆炸或触发限流

**技术要点**:
- Promise 链式调用
- 异步队列管理
- 并发控制算法

**验收标准**:
- [ ] 支持指定最大并发数
- [ ] 超出并发限制的任务排队等待
- [ ] 支持排队超时
- [ ] 支持优雅关闭

→ [查看详情](p01-semaphore/)

---

### P02: 自定义 Transform 流

**目标**: 实现多种 Transform 流，理解流的背压机制。

**应用场景**:
- 大文件处理（压缩、加密、解析）
- 数据格式转换
- 流式处理流水线

**技术要点**:
- Stream API
- 背压机制
- pipe vs pipeline

**验收标准**:
- [ ] 实现 JSON 解析器 Transform
- [ ] 实现行计数器 Transform
- [ ] 实现背压感知的流处理
- [ ] 支持流的错误处理

→ [查看详情](p02-transform-stream/)

---

### P03: LLM 代理网关

**目标**: 实现一个支持多 Provider 的 LLM 代理网关。

**应用场景**:
- 统一 LLM 调用接口
- 多模型负载均衡
- 请求限流和缓存

**技术要点**:
- 适配器模式
- 流式响应 (SSE)
- 并发控制

**验收标准**:
- [ ] 支持 OpenAI 兼容接口
- [ ] 支持 Anthropic 接口
- [ ] 支持流式响应
- [ ] 实现基本的限流

→ [查看详情](p03-llm-proxy/)

---

### P04: RAG 服务

**目标**: 实现一个完整的 RAG (Retrieval-Augmented Generation) 服务。

**应用场景**:
- 企业知识库
- 文档问答系统
- 私有知识增强

**技术要点**:
- 文档分块策略
- Embedding 生成
- 向量相似度搜索
- Prompt 组装

**验收标准**:
- [ ] 支持文档上传和解析
- [ ] 实现 Embedding 生成
- [ ] 实现向量存储和检索
- [ ] 支持 RAG 问答

→ [查看详情](p04-rag-service/)

---

### P05: Worker 线程池

**目标**: 实现一个通用的 Worker 线程池，用于 CPU 密集型任务。

**应用场景**:
- 图像处理
- 数据加密/解密
- 复杂计算

**技术要点**:
- Worker Threads API
- 线程池管理
- 任务队列

**验收标准**:
- [ ] 支持固定数量的 Worker
- [ ] 支持任务提交和结果获取
- [ ] 支持 Worker 异常处理
- [ ] 支持优雅关闭

→ [查看详情](p05-worker-pool/)

---

### P06: C++ 原生模块

**目标**: 使用 N-API 编写 C++ 原生模块。

**应用场景**:
- 性能关键代码
- 调用 C/C++ 库
- 复用现有 native 代码

**技术要点**:
- N-API API
- 异步操作
- 线程安全

**验收标准**:
- [ ] 实现基本的加法函数
- [ ] 实现异步计算函数
- [ ] 实现 Promise 版本 API
- [ ] 支持错误处理

→ [查看详情](p06-native-addon/)

---

## 学习路径

```
Phase 1 → P01 (Semaphore)
Phase 2 → P02 (Transform Stream)
Phase 4 → P03 (LLM Proxy) → P04 (RAG Service)
Phase 6 → P05 (Worker Pool) → P06 (Native Addon)
```
