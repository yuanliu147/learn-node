# 知识节点 (Knowledge Nodes)

> Node.js 核心知识点的深度解析

## 总览

| 分类 | 路径 | 节点数 |
|------|------|--------|
| 01-Foundation | [01-foundation/](01-foundation/README.md) | 6 |
| 02-Async | [02-async/](02-async/README.md) | 5 |
| 03-Stream | [03-stream/](03-stream/README.md) | 5 |
| 04-Network | [04-network/](04-network/README.md) | 5 |
| 05-Memory | [05-memory/](05-memory/README.md) | 6 |
| 06-V8 | [06-v8/](06-v8/README.md) | 5 |
| 07-libuv | [07-libuv/](07-libuv/README.md) | 5 |
| 08-Framework | [08-framework/](08-framework/README.md) | 4 |
| 09-AI-Backend | [09-ai-backend/](09-ai-backend/README.md) | 7 |
| 10-Performance | [10-performance/](10-performance/README.md) | 5 |
| 11-Advanced | [11-advanced/](11-advanced/README.md) | 5 |

**总计**: 59 个知识节点

---

## 快速导航

### 基础原理 (Foundation)

| 节点 | 标题 | 难度 |
|------|------|------|
| [event-loop-phases](01-foundation/event-loop-phases.md) | 事件循环的 Phase 详解 | L3 |
| [microtask-macrotask](01-foundation/microtask-macrotask.md) | 微任务与宏任务 | L3 |
| [commonjs-vs-esm](01-foundation/commonjs-vs-esm.md) | CommonJS vs ESM | L2 |
| [module-loading](01-foundation/module-loading.md) | 模块加载机制 | L3 |
| [buffer-memory](01-foundation/buffer-memory.md) | Buffer 与内存 | L3 |
| [process-vs-worker](01-foundation/process-vs-worker.md) | Process vs Worker Threads | L3 |

### 异步机制 (Async)

| 节点 | 标题 | 难度 |
|------|------|------|
| [promise-internals](02-async/promise-internals.md) | Promise 内部原理 | L4 |
| [async-await-transform](02-async/async-await-transform.md) | async/await 转换原理 | L3 |
| [event-emitter](02-async/event-emitter.md) | EventEmitter 详解 | L3 |
| [timers-nexttick](02-async/timers-nexttick.md) | setTimeout 与 nextTick | L2 |
| [async-hooks](02-async/async-hooks.md) | async_hooks 原理 | L4 |

### 流系统 (Stream)

| 节点 | 标题 | 难度 |
|------|------|------|
| [stream-types](03-stream/stream-types.md) | Stream 类型详解 | L3 |
| [backpressure-mechanism](03-stream/backpressure-mechanism.md) | 背压机制 | L4 |
| [pipeline-vs-pipe](03-stream/pipeline-vs-pipe.md) | pipeline vs pipe | L3 |
| [object-mode](03-stream/object-mode.md) | 对象模式 | L3 |
| [stream-error-handling](03-stream/stream-error-handling.md) | 流错误处理 | L3 |

### 网络 (Network)

| 节点 | 标题 | 难度 |
|------|------|------|
| [http-lifecycle](04-network/http-lifecycle.md) | HTTP 请求生命周期 | L3 |
| [tcp-connection-pool](04-network/tcp-connection-pool.md) | TCP 连接池 | L3 |
| [keep-alive-optimization](04-network/keep-alive-optimization.md) | Keep-Alive 优化 | L3 |
| [tls-handshake](04-network/tls-handshake.md) | TLS 握手过程 | L4 |
| [websocket-internals](04-network/websocket-internals.md) | WebSocket 内部原理 | L4 |

### 内存 (Memory)

| 节点 | 标题 | 难度 |
|------|------|------|
| [v8-heap-structure](05-memory/v8-heap-structure.md) | V8 堆结构 | L4 |
| [scavenge-algorithm](05-memory/scavenge-algorithm.md) | Scavenge 算法 | L4 |
| [mark-sweep-compact](05-memory/mark-sweep-compact.md) | Mark-Sweep-Compact | L4 |
| [incremental-concurrent-gc](05-memory/incremental-concurrent-gc.md) | 增量并发 GC | L5 |
| [memory-leak-patterns](05-memory/memory-leak-patterns.md) | 内存泄漏模式 | L4 |
| [heapdump-analysis](05-memory/heapdump-analysis.md) | Heapdump 分析 | L4 |

### V8 引擎 (V8)

| 节点 | 标题 | 难度 |
|------|------|------|
| [ignition-bytecode](06-v8/ignition-bytecode.md) | Ignition 字节码 | L4 |
| [turbofan-optimization](06-v8/turbofan-optimization.md) | TurboFan 优化 | L5 |
| [hidden-class-inline-cache](06-v8/hidden-class-inline-cache.md) | 隐藏类与内联缓存 | L5 |
| [deoptimization](06-v8/deoptimization.md) | 反优化机制 | L5 |
| [object-layout](06-v8/object-layout.md) | 对象布局 | L4 |

### libuv

| 节点 | 标题 | 难度 |
|------|------|------|
| [uv-run-phases](07-libuv/uv-run-phases.md) | uv_run 阶段 | L4 |
| [handle-types](07-libuv/handle-types.md) | Handle 类型 | L4 |
| [threadpool-fs-dns](07-libuv/threadpool-fs-dns.md) | 线程池与 FS/DNS | L4 |
| [cross-platform-io](07-libuv/cross-platform-io.md) | 跨平台 I/O | L4 |
| [io-uring](07-libuv/io-uring.md) | io_uring | L5 |

### 框架 (Framework)

| 节点 | 标题 | 难度 |
|------|------|------|
| [express-middleware-chain](08-framework/express-middleware-chain.md) | Express 中间件链 | L3 |
| [nestjs-di-container](08-framework/nestjs-di-container.md) | NestJS DI 容器 | L4 |
| [decorator-metadata](08-framework/decorator-metadata.md) | 装饰器与元数据 | L4 |
| [interceptor-guard-pipe](08-framework/interceptor-guard-pipe.md) | 拦截器/守卫/管道 | L4 |

### AI 后端 (AI Backend)

| 节点 | 标题 | 难度 |
|------|------|------|
| [sse-streaming](09-ai-backend/sse-streaming.md) | SSE 流式响应 | L3 |
| [llm-provider-adapter](09-ai-backend/llm-provider-adapter.md) | LLM Provider 适配器 | L3 |
| [rag-pipeline](09-ai-backend/rag-pipeline.md) | RAG 流水线 | L4 |
| [concurrency-control](09-ai-backend/concurrency-control.md) | 并发控制 | L4 |
| [token-rate-limit](09-ai-backend/token-rate-limit.md) | Token 限流 | L4 |
| [prompt-injection-defense](09-ai-backend/prompt-injection-defense.md) | Prompt 注入防御 | L4 |
| [embedding-vector-store](09-ai-backend/embedding-vector-store.md) | Embedding 与向量存储 | L3 |

### 性能 (Performance)

| 节点 | 标题 | 难度 |
|------|------|------|
| [clinic-js-workflow](10-performance/clinic-js-workflow.md) | Clinic.js 工作流 | L3 |
| [flame-graph-reading](10-performance/flame-graph-reading.md) | 火焰图阅读 | L4 |
| [connection-pool-tuning](10-performance/connection-pool-tuning.md) | 连接池调优 | L3 |
| [dns-caching](10-performance/dns-caching.md) | DNS 缓存 | L3 |
| [zero-copy-techniques](10-performance/zero-copy-techniques.md) | 零拷贝技术 | L4 |

### 进阶 (Advanced)

| 节点 | 标题 | 难度 |
|------|------|------|
| [node-startup-flow](11-advanced/node-startup-flow.md) | Node 启动流程 | L4 |
| [cpp-binding-napi](11-advanced/cpp-binding-napi.md) | C++ N-API 绑定 | L4 |
| [threadsafe-function](11-advanced/threadsafe-function.md) | 线程安全函数 | L5 |
| [cluster-load-balance](11-advanced/cluster-load-balance.md) | Cluster 负载均衡 | L4 |
| [ipc-serialization](11-advanced/ipc-serialization.md) | IPC 序列化 | L4 |

---

## 使用建议

1. **按需学习**: 不必按顺序学习所有节点，根据自己的目标选择相关节点
2. **深度优先**: 每个节点都要理解透彻，不仅仅是表面记忆
3. **结合源码**: 重要节点建议配合 Node.js 源码阅读
4. **动手实践**: 每个节点都有对应的实践任务，请务必动手实现
