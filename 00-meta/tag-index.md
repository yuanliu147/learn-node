---
version: 1.0
last_updated: 2026-04-21
description: 按标签组织的知识节点索引
---

# 标签索引 (Tag Index)

> 通过标签快速查找相关知识节点

## 标签总览

| 标签 | 节点数 | 说明 |
|------|--------|------|
| `event-loop` | 4 | 事件循环相关 |
| `libuv` | 6 | libuv 核心 |
| `v8` | 6 | V8 引擎 |
| `memory` | 6 | 内存与 GC |
| `stream` | 5 | 流系统 |
| `async` | 6 | 异步编程 |
| `network` | 5 | 网络编程 |
| `http` | 3 | HTTP 协议 |
| `module` | 2 | 模块系统 |
| `promise` | 2 | Promise |
| `worker` | 2 | 多线程 |
| `performance` | 5 | 性能优化 |
| `gc` | 4 | 垃圾回收 |
| `interview-hot` | 12 | 面试高频 |
| `core` | 8 | 核心概念 |
| `security` | 1 | 安全 |
| `ai-backend` | 7 | AI 后端 |
| `framework` | 4 | 框架 |
| `cli` | 1 | 命令行 |
| `debug` | 2 | 调试 |

---

## 按标签查找

### `event-loop` - 事件循环

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [event-loop-phases](../02-nodes/01-foundation/event-loop-phases.md) | 事件循环的 Phase 详解 | L3 | 01-foundation |
| [microtask-macrotask](../02-nodes/01-foundation/microtask-macrotask.md) | 微任务与宏任务 | L3 | 01-foundation |
| [timers-nexttick](../02-nodes/02-async/timers-nexttick.md) | setTimeout 与 process.nextTick | L2 | 02-async |
| [uv-run-phases](../02-nodes/07-libuv/uv-run-phases.md) | uv_run 阶段 | L4 | 07-libuv |

### `libuv` - libuv

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [uv-run-phases](../02-nodes/07-libuv/uv-run-phases.md) | uv_run 阶段 | L4 | 07-libuv |
| [handle-types](../02-nodes/07-libuv/handle-types.md) | Handle 类型 | L4 | 07-libuv |
| [threadpool-fs-dns](../02-nodes/07-libuv/threadpool-fs-dns.md) | 线程池与 FS/DNS | L4 | 07-libuv |
| [cross-platform-io](../02-nodes/07-libuv/cross-platform-io.md) | 跨平台 I/O | L4 | 07-libuv |
| [io-uring](../02-nodes/07-libuv/io-uring.md) | io_uring | L5 | 07-libuv |
| [event-loop-phases](../02-nodes/01-foundation/event-loop-phases.md) | 事件循环的 Phase 详解 | L3 | 01-foundation |

### `v8` - V8 引擎

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [ignition-bytecode](../02-nodes/06-v8/ignition-bytecode.md) | Ignition 字节码 | L4 | 06-v8 |
| [turbofan-optimization](../02-nodes/06-v8/turbofan-optimization.md) | TurboFan 优化 | L5 | 06-v8 |
| [hidden-class-inline-cache](../02-nodes/06-v8/hidden-class-inline-cache.md) | 隐藏类与内联缓存 | L5 | 06-v8 |
| [deoptimization](../02-nodes/06-v8/deoptimization.md) | 反优化机制 | L5 | 06-v8 |
| [object-layout](../02-nodes/06-v8/object-layout.md) | 对象布局 | L4 | 06-v8 |
| [v8-heap-structure](../02-nodes/05-memory/v8-heap-structure.md) | V8 堆结构 | L4 | 05-memory |

### `memory` - 内存

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [v8-heap-structure](../02-nodes/05-memory/v8-heap-structure.md) | V8 堆结构 | L4 | 05-memory |
| [memory-leak-patterns](../02-nodes/05-memory/memory-leak-patterns.md) | 内存泄漏模式 | L4 | 05-memory |
| [heapdump-analysis](../02-nodes/05-memory/heapdump-analysis.md) | Heapdump 分析 | L4 | 05-memory |
| [buffer-memory](../02-nodes/01-foundation/buffer-memory.md) | Buffer 与内存 | L3 | 01-foundation |
| [scavenge-algorithm](../02-nodes/05-memory/scavenge-algorithm.md) | Scavenge 算法 | L4 | 05-memory |
| [mark-sweep-compact](../02-nodes/05-memory/mark-sweep-compact.md) | Mark-Sweep-Compact | L4 | 05-memory |

### `stream` - 流系统

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [stream-types](../02-nodes/03-stream/stream-types.md) | Stream 类型详解 | L3 | 03-stream |
| [backpressure-mechanism](../02-nodes/03-stream/backpressure-mechanism.md) | 背压机制 | L4 | 03-stream |
| [pipeline-vs-pipe](../02-nodes/03-stream/pipeline-vs-pipe.md) | pipeline vs pipe | L3 | 03-stream |
| [object-mode](../02-nodes/03-stream/object-mode.md) | 对象模式 | L3 | 03-stream |
| [stream-error-handling](../02-nodes/03-stream/stream-error-handling.md) | 流错误处理 | L3 | 03-stream |

### `async` - 异步编程

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [promise-internals](../02-nodes/02-async/promise-internals.md) | Promise 内部原理 | L4 | 02-async |
| [async-await-transform](../02-nodes/02-async/async-await-transform.md) | async/await 转换原理 | L3 | 02-async |
| [event-emitter](../02-nodes/02-async/event-emitter.md) | EventEmitter 详解 | L3 | 02-async |
| [timers-nexttick](../02-nodes/02-async/timers-nexttick.md) | setTimeout 与 process.nextTick | L2 | 02-async |
| [async-hooks](../02-nodes/02-async/async-hooks.md) | async_hooks 原理 | L4 | 02-async |
| [concurrency-control](../02-nodes/09-ai-backend/concurrency-control.md) | 并发控制 | L4 | 09-ai-backend |

### `network` - 网络编程

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [http-lifecycle](../02-nodes/04-network/http-lifecycle.md) | HTTP 请求生命周期 | L3 | 04-network |
| [tcp-connection-pool](../02-nodes/04-network/tcp-connection-pool.md) | TCP 连接池 | L3 | 04-network |
| [keep-alive-optimization](../02-nodes/04-network/keep-alive-optimization.md) | Keep-Alive 优化 | L3 | 04-network |
| [tls-handshake](../02-nodes/04-network/tls-handshake.md) | TLS 握手过程 | L4 | 04-network |
| [websocket-internals](../02-nodes/04-network/websocket-internals.md) | WebSocket 内部原理 | L4 | 04-network |

### `http` - HTTP 协议

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [http-lifecycle](../02-nodes/04-network/http-lifecycle.md) | HTTP 请求生命周期 | L3 | 04-network |
| [express-middleware-chain](../02-nodes/08-framework/express-middleware-chain.md) | Express 中间件链 | L3 | 08-framework |
| [sse-streaming](../02-nodes/09-ai-backend/sse-streaming.md) | SSE 流式响应 | L3 | 09-ai-backend |

### `module` - 模块系统

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [commonjs-vs-esm](../02-nodes/01-foundation/commonjs-vs-esm.md) | CommonJS vs ESM | L2 | 01-foundation |
| [module-loading](../02-nodes/01-foundation/module-loading.md) | 模块加载机制 | L3 | 01-foundation |

### `promise` - Promise

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [promise-internals](../02-nodes/02-async/promise-internals.md) | Promise 内部原理 | L4 | 02-async |
| [async-await-transform](../02-nodes/02-async/async-await-transform.md) | async/await 转换原理 | L3 | 02-async |

### `worker` - 多线程

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [process-vs-worker](../02-nodes/01-foundation/process-vs-worker.md) | Process 与 Worker Threads | L3 | 01-foundation |
| [cluster-load-balance](../02-nodes/11-advanced/cluster-load-balance.md) | Cluster 负载均衡 | L4 | 11-advanced |

### `performance` - 性能优化

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [clinic-js-workflow](../02-nodes/10-performance/clinic-js-workflow.md) | Clinic.js 工作流 | L3 | 10-performance |
| [flame-graph-reading](../02-nodes/10-performance/flame-graph-reading.md) | 火焰图阅读 | L4 | 10-performance |
| [connection-pool-tuning](../02-nodes/10-performance/connection-pool-tuning.md) | 连接池调优 | L3 | 10-performance |
| [dns-caching](../02-nodes/10-performance/dns-caching.md) | DNS 缓存 | L3 | 10-performance |
| [zero-copy-techniques](../02-nodes/10-performance/zero-copy-techniques.md) | 零拷贝技术 | L4 | 10-performance |

### `gc` - 垃圾回收

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [scavenge-algorithm](../02-nodes/05-memory/scavenge-algorithm.md) | Scavenge 算法 | L4 | 05-memory |
| [mark-sweep-compact](../02-nodes/05-memory/mark-sweep-compact.md) | Mark-Sweep-Compact | L4 | 05-memory |
| [incremental-concurrent-gc](../02-nodes/05-memory/incremental-concurrent-gc.md) | 增量并发 GC | L5 | 05-memory |
| [v8-heap-structure](../02-nodes/05-memory/v8-heap-structure.md) | V8 堆结构 | L4 | 05-memory |

### `interview-hot` - 面试高频

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [event-loop-phases](../02-nodes/01-foundation/event-loop-phases.md) | 事件循环的 Phase 详解 | L3 | 01-foundation |
| [microtask-macrotask](../02-nodes/01-foundation/microtask-macrotask.md) | 微任务与宏任务 | L3 | 01-foundation |
| [commonjs-vs-esm](../02-nodes/01-foundation/commonjs-vs-esm.md) | CommonJS vs ESM | L2 | 01-foundation |
| [process-vs-worker](../02-nodes/01-foundation/process-vs-worker.md) | Process 与 Worker Threads | L3 | 01-foundation |
| [promise-internals](../02-nodes/02-async/promise-internals.md) | Promise 内部原理 | L4 | 02-async |
| [async-await-transform](../02-nodes/02-async/async-await-transform.md) | async/await 转换原理 | L3 | 02-async |
| [event-emitter](../02-nodes/02-async/event-emitter.md) | EventEmitter 详解 | L3 | 02-async |
| [timers-nexttick](../02-nodes/02-async/timers-nexttick.md) | setTimeout 与 process.nextTick | L2 | 02-async |
| [stream-types](../02-nodes/03-stream/stream-types.md) | Stream 类型详解 | L3 | 03-stream |
| [http-lifecycle](../02-nodes/04-network/http-lifecycle.md) | HTTP 请求生命周期 | L3 | 04-network |
| [v8-heap-structure](../02-nodes/05-memory/v8-heap-structure.md) | V8 堆结构 | L4 | 05-memory |
| [memory-leak-patterns](../02-nodes/05-memory/memory-leak-patterns.md) | 内存泄漏模式 | L4 | 05-memory |
| [express-middleware-chain](../02-nodes/08-framework/express-middleware-chain.md) | Express 中间件链 | L3 | 08-framework |
| [prompt-injection-defense](../02-nodes/09-ai-backend/prompt-injection-defense.md) | Prompt 注入防御 | L4 | 09-ai-backend |
| [node-startup-flow](../02-nodes/11-advanced/node-startup-flow.md) | Node 启动流程 | L4 | 11-advanced |

### `core` - 核心概念

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [event-loop-phases](../02-nodes/01-foundation/event-loop-phases.md) | 事件循环的 Phase 详解 | L3 | 01-foundation |
| [microtask-macrotask](../02-nodes/01-foundation/microtask-macrotask.md) | 微任务与宏任务 | L3 | 01-foundation |
| [commonjs-vs-esm](../02-nodes/01-foundation/commonjs-vs-esm.md) | CommonJS vs ESM | L2 | 01-foundation |
| [module-loading](../02-nodes/01-foundation/module-loading.md) | 模块加载机制 | L3 | 01-foundation |
| [buffer-memory](../02-nodes/01-foundation/buffer-memory.md) | Buffer 与内存 | L3 | 01-foundation |
| [process-vs-worker](../02-nodes/01-foundation/process-vs-worker.md) | Process 与 Worker Threads | L3 | 01-foundation |
| [event-emitter](../02-nodes/02-async/event-emitter.md) | EventEmitter 详解 | L3 | 02-async |
| [stream-types](../02-nodes/03-stream/stream-types.md) | Stream 类型详解 | L3 | 03-stream |

### `security` - 安全

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [prompt-injection-defense](../02-nodes/09-ai-backend/prompt-injection-defense.md) | Prompt 注入防御 | L4 | 09-ai-backend |

### `ai-backend` - AI 后端

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [sse-streaming](../02-nodes/09-ai-backend/sse-streaming.md) | SSE 流式响应 | L3 | 09-ai-backend |
| [llm-provider-adapter](../02-nodes/09-ai-backend/llm-provider-adapter.md) | LLM Provider 适配器 | L3 | 09-ai-backend |
| [rag-pipeline](../02-nodes/09-ai-backend/rag-pipeline.md) | RAG 流水线 | L4 | 09-ai-backend |
| [concurrency-control](../02-nodes/09-ai-backend/concurrency-control.md) | 并发控制 | L4 | 09-ai-backend |
| [token-rate-limit](../02-nodes/09-ai-backend/token-rate-limit.md) | Token 限流 | L4 | 09-ai-backend |
| [prompt-injection-defense](../02-nodes/09-ai-backend/prompt-injection-defense.md) | Prompt 注入防御 | L4 | 09-ai-backend |
| [embedding-vector-store](../02-nodes/09-ai-backend/embedding-vector-store.md) | Embedding 与向量存储 | L3 | 09-ai-backend |

### `framework` - 框架

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [express-middleware-chain](../02-nodes/08-framework/express-middleware-chain.md) | Express 中间件链 | L3 | 08-framework |
| [nestjs-di-container](../02-nodes/08-framework/nestjs-di-container.md) | NestJS DI 容器 | L4 | 08-framework |
| [decorator-metadata](../02-nodes/08-framework/decorator-metadata.md) | 装饰器与元数据 | L4 | 08-framework |
| [interceptor-guard-pipe](../02-nodes/08-framework/interceptor-guard-pipe.md) | 拦截器/守卫/管道 | L4 | 08-framework |

### `debug` - 调试

| 节点 | 标题 | 难度 | 分类 |
|------|------|------|------|
| [heapdump-analysis](../02-nodes/05-memory/heapdump-analysis.md) | Heapdump 分析 | L4 | 05-memory |
| [clinic-js-workflow](../02-nodes/10-performance/clinic-js-workflow.md) | Clinic.js 工作流 | L3 | 10-performance |

---

*最后更新: 2026-04-21*
