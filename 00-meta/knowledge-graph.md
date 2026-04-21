---
version: 1.0
last_updated: 2026-04-21
ai_confidence: 4
human_verified: false
description: 所有知识节点的依赖关系图谱
---

# 知识图谱 (Knowledge Graph)

> 记录所有知识节点的 ID、分类、依赖关系、难度、面试热度

## 图例

```
[L1-L5] = 难度等级     🔥 = 面试高频     ⭐ = 核心节点
→ = 前置依赖           ⇄ = 互相关联
```

## 依赖关系总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           知识节点依赖关系图                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │ js-es6-plus     │ ← 前置基础 (Phase 0)                                   │
│  │ L1              │                                                       │
│  └────────┬────────┘                                                       │
│           │                                                                │
│           ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │                      Phase 1: 原生 Node.js 基础                     │      │
│  ├──────────────────────────────────────────────────────────────────┤      │
│  │                                                                   │      │
│  │  commonjs-vs-esm ──→ module-loading ──→ module-resolution      │      │
│  │  [L2]              [L3]              [L3]                        │      │
│  │       │                                                         │      │
│  │       ▼                                                         │      │
│  │  event-loop-phases ⇄ microtask-macrotask                        │      │
│  │  [L3] 🔥           [L3] 🔥                                       │      │
│  │       │                   │                                     │      │
│  │       ▼                   ▼                                     │      │
│  │  timers-nexttick ──→ async-hooks                                │      │
│  │  [L2] 🔥             [L4]                                       │      │
│  │       │                                                         │      │
│  │       ▼                                                         │      │
│  │  buffer-memory ──→ process-vs-worker                           │      │
│  │  [L3]               [L3] 🔥                                      │      │
│  │                                                                   │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│           │                                                                │
│           ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │                      Phase 2: 异步与流                              │      │
│  ├──────────────────────────────────────────────────────────────────┤      │
│  │                                                                   │      │
│  │  promise-internals ──→ async-await-transform                    │      │
│  │  [L4] 🔥              [L3] 🔥                                     │      │
│  │       │                                                             │      │
│  │       ▼                                                             │      │
│  │  event-emitter (已在上方定义)                                       │      │
│  │                                                                   │      │
│  │  stream-types ──→ backpressure-mechanism                          │      │
│  │  [L3] 🔥            [L4]                                           │      │
│  │       │                    │                                     │      │
│  │       ▼                    ▼                                     │      │
│  │  pipeline-vs-pipe ──→ object-mode ──→ stream-error-handling      │      │
│  │  [L3]                [L3]           [L3]                          │      │
│  │                                                                   │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│           │                                                                │
│           ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │                      Phase 3: 框架与工程化                         │      │
│  ├──────────────────────────────────────────────────────────────────┤      │
│  │                                                                   │      │
│  │  express-middleware-chain                                        │      │
│  │  [L3] 🔥                                                         │      │
│  │       │                                                         │      │
│  │       ▼                                                         │      │
│  │  nestjs-di-container ──→ decorator-metadata                      │      │
│  │  [L4]                  [L4]                                     │      │
│  │       │                                                             │      │
│  │       ▼                                                             │      │
│  │  interceptor-guard-pipe                                           │      │
│  │  [L4]                                                             │      │
│  │                                                                   │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│           │                                                                │
│           ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │                      Phase 4: AI 后端专项                           │      │
│  ├──────────────────────────────────────────────────────────────────┤      │
│  │                                                                   │      │
│  │  sse-streaming ⇄ llm-provider-adapter                            │      │
│  │  [L3]           [L3]                                              │      │
│  │       │                  │                                       │      │
│  │       ▼                  ▼                                       │      │
│  │  concurrency-control ←→ token-rate-limit                         │      │
│  │  [L4]                  [L4]                                      │      │
│  │       │                                                         │      │
│  │       ▼                                                         │      │
│  │  rag-pipeline ──→ embedding-vector-store                          │      │
│  │  [L4]           [L3]                                             │      │
│  │       │                                                         │      │
│  │       ▼                                                         │      │
│  │  prompt-injection-defense                                        │      │
│  │  [L4] 🔥                                                         │      │
│  │                                                                   │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│           │                                                                │
│           ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │                      Phase 5: 性能优化                             │      │
│  ├──────────────────────────────────────────────────────────────────┤      │
│  │                                                                   │      │
│  │  v8-heap-structure ──→ memory-leak-patterns ──→ heapdump-analysis│      │
│  │  [L4]                 [L4] 🔥              [L4]                  │      │
│  │       │                                                             │      │
│  │       ▼                                                             │      │
│  │  scavenge-algorithm ⇄ mark-sweep-compact                         │      │
│  │  [L4]                 [L4]                                          │      │
│  │       │                                                             │      │
│  │       ▼                                                             │      │
│  │  incremental-concurrent-gc                                        │      │
│  │  [L5]                                                             │      │
│  │                                                                   │      │
│  │  ignition-bytecode ──→ turbofan-optimization                      │      │
│  │  [L4]               [L5]                                          │      │
│  │       │                   │                                       │      │
│  │       ▼                   ▼                                       │      │
│  │  hidden-class-inline-cache ──→ deoptimization ──→ object-layout  │      │
│  │  [L5]                    [L5]             [L4]                   │      │
│  │                                                                   │      │
│  │  clinic-js-workflow ──→ flame-graph-reading                      │      │
│  │  [L3]                  [L4]                                       │      │
│  │       │                                                         │      │
│  │       ▼                                                         │      │
│  │  connection-pool-tuning ⇄ dns-caching                            │      │
│  │  [L3]                  [L3]                                      │      │
│  │       │                                                         │      │
│  │       ▼                                                         │      │
│  │  zero-copy-techniques                                            │      │
│  │  [L4]                                                             │      │
│  │                                                                   │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│           │                                                                │
│           ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │                      Phase 6: 进阶与源码                           │      │
│  ├──────────────────────────────────────────────────────────────────┤      │
│  │                                                                   │      │
│  │  uv-run-phases ──→ handle-types ──→ threadpool-fs-dns          │      │
│  │  [L4]             [L4]         [L4]                             │      │
│  │       │                  │                                      │      │
│  │       ▼                  ▼                                      │      │
│  │  cross-platform-io ──→ io-uring                                 │      │
│  │  [L4]               [L5]                                        │      │
│  │                                                                   │      │
│  │  node-startup-flow                                               │      │
│  │  [L4] 🔥                                                         │      │
│  │       │                                                         │      │
│  │       ▼                                                         │      │
│  │  cpp-binding-napi ──→ threadsafe-function                       │      │
│  │  [L4]               [L5]                                        │      │
│  │       │                                                         │      │
│  │       ▼                                                         │      │
│  │  cluster-load-balance ⇄ ipc-serialization                      │      │
│  │  [L4]                   [L4]                                    │      │
│  │                                                                   │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 节点清单

### 01-Foundation 基础原理

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `event-loop-phases` | 事件循环的 Phase 详解 | L3 | - | `timers-nexttick`, `microtask-macrotask`, `uv-run-phases` | 🔥 |
| `microtask-macrotask` | 微任务与宏任务 | L3 | `event-loop-phases` | `timers-nexttick`, `async-await-transform` | 🔥 |
| `commonjs-vs-esm` | CommonJS vs ESM | L2 | - | `module-loading` | 🔥 |
| `module-loading` | 模块加载机制 | L3 | `commonjs-vs-esm` | `module-resolution` | - |
| `buffer-memory` | Buffer 与内存 | L3 | - | `process-vs-worker` | - |
| `process-vs-worker` | Process 与 Worker Threads | L3 | `buffer-memory` | `cluster-load-balance` | 🔥 |

### 02-Async 异步机制

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `promise-internals` | Promise 内部原理 | L4 | `microtask-macrotask` | `async-await-transform` | 🔥 |
| `async-await-transform` | async/await 转换原理 | L3 | `promise-internals` | - | 🔥 |
| `event-emitter` | EventEmitter 详解 | L3 | `event-loop-phases` | - | 🔥 |
| `timers-nexttick` | setTimeout 与 process.nextTick | L2 | `event-loop-phases` | `async-hooks` | 🔥 |
| `async-hooks` | async_hooks 原理 | L4 | `timers-nexttick` | - | - |

### 03-Stream 流系统

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `stream-types` | Stream 类型详解 | L3 | `event-emitter` | `backpressure-mechanism` | 🔥 |
| `backpressure-mechanism` | 背压机制 | L4 | `stream-types` | `pipeline-vs-pipe` | - |
| `pipeline-vs-pipe` | pipeline vs pipe | L3 | `backpressure-mechanism` | `object-mode` | - |
| `object-mode` | 对象模式 | L3 | `pipeline-vs-pipe` | - | - |
| `stream-error-handling` | 流错误处理 | L3 | `stream-types` | - | - |

### 04-Network 网络

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `http-lifecycle` | HTTP 请求生命周期 | L3 | - | `tcp-connection-pool` | 🔥 |
| `tcp-connection-pool` | TCP 连接池 | L3 | `http-lifecycle` | `keep-alive-optimization` | - |
| `keep-alive-optimization` | Keep-Alive 优化 | L3 | `tcp-connection-pool` | - | - |
| `tls-handshake` | TLS 握手过程 | L4 | `tcp-connection-pool` | - | - |
| `websocket-internals` | WebSocket 内部原理 | L4 | `http-lifecycle` | - | - |

### 05-Memory 内存

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `v8-heap-structure` | V8 堆结构 | L4 | - | `scavenge-algorithm` | 🔥 |
| `scavenge-algorithm` | Scavenge 算法 | L4 | `v8-heap-structure` | `mark-sweep-compact` | - |
| `mark-sweep-compact` | Mark-Sweep-Compact | L4 | `scavenge-algorithm` | `incremental-concurrent-gc` | - |
| `incremental-concurrent-gc` | 增量并发 GC | L5 | `mark-sweep-compact` | - | - |
| `memory-leak-patterns` | 内存泄漏模式 | L4 | `v8-heap-structure` | `heapdump-analysis` | 🔥 |
| `heapdump-analysis` | Heapdump 分析 | L4 | `memory-leak-patterns` | - | - |

### 06-V8 引擎

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `ignition-bytecode` | Ignition 字节码 | L4 | - | `turbofan-optimization` | - |
| `turbofan-optimization` | TurboFan 优化 | L5 | `ignition-bytecode` | `deoptimization` | - |
| `hidden-class-inline-cache` | 隐藏类与内联缓存 | L5 | `turbofan-optimization` | `deoptimization` | 🔥 |
| `deoptimization` | 反优化机制 | L5 | `turbofan-optimization` | `object-layout` | - |
| `object-layout` | 对象布局 | L4 | `hidden-class-inline-cache` | - | - |

### 07-libuv

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `uv-run-phases` | uv_run 阶段 | L4 | `event-loop-phases` | `handle-types` | - |
| `handle-types` | Handle 类型 | L4 | `uv-run-phases` | `threadpool-fs-dns` | - |
| `threadpool-fs-dns` | 线程池与 FS/DNS | L4 | `handle-types` | `cross-platform-io` | - |
| `cross-platform-io` | 跨平台 I/O | L4 | `threadpool-fs-dns` | `io-uring` | - |
| `io-uring` | io_uring | L5 | `cross-platform-io` | - | - |

### 08-Framework 框架

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `express-middleware-chain` | Express 中间件链 | L3 | `event-emitter` | - | 🔥 |
| `nestjs-di-container` | NestJS DI 容器 | L4 | `express-middleware-chain` | `decorator-metadata` | - |
| `decorator-metadata` | 装饰器与元数据 | L4 | `nestjs-di-container` | `interceptor-guard-pipe` | - |
| `interceptor-guard-pipe` | 拦截器/守卫/管道 | L4 | `decorator-metadata` | - | - |

### 09-AI-Backend AI 后端

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `sse-streaming` | SSE 流式响应 | L3 | - | `llm-provider-adapter` | - |
| `llm-provider-adapter` | LLM Provider 适配器 | L3 | `sse-streaming` | `concurrency-control` | - |
| `rag-pipeline` | RAG 流水线 | L4 | `llm-provider-adapter` | `embedding-vector-store` | - |
| `concurrency-control` | 并发控制 | L4 | `llm-provider-adapter` | `token-rate-limit` | - |
| `token-rate-limit` | Token 限流 | L4 | `concurrency-control` | - | - |
| `prompt-injection-defense` | Prompt 注入防御 | L4 | - | - | 🔥 |
| `embedding-vector-store` | Embedding 与向量存储 | L3 | `rag-pipeline` | - | - |

### 10-Performance 性能

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `clinic-js-workflow` | Clinic.js 工作流 | L3 | - | `flame-graph-reading` | - |
| `flame-graph-reading` | 火焰图阅读 | L4 | `clinic-js-workflow` | - | - |
| `connection-pool-tuning` | 连接池调优 | L3 | - | `dns-caching` | - |
| `dns-caching` | DNS 缓存 | L3 | `connection-pool-tuning` | - | - |
| `zero-copy-techniques` | 零拷贝技术 | L4 | - | - | - |

### 11-Advanced 进阶

| ID | 标题 | 难度 | 前置 | 关联 | 面试 |
|----|------|------|------|------|------|
| `node-startup-flow` | Node 启动流程 | L4 | - | `cpp-binding-napi` | 🔥 |
| `cpp-binding-napi` | C++ N-API 绑定 | L4 | `node-startup-flow` | `threadsafe-function` | - |
| `threadsafe-function` | 线程安全函数 | L5 | `cpp-binding-napi` | - | - |
| `cluster-load-balance` | Cluster 负载均衡 | L4 | `process-vs-worker` | `ipc-serialization` | - |
| `ipc-serialization` | IPC 序列化 | L4 | `cluster-load-balance` | - | - |

---

## 学习路径建议

### 路径 A: 全栈路线 (推荐)

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
```

### 路径 B: 偏后端路线

```
Phase 0 → Phase 1 → Phase 2 → Phase 5 → Phase 6 → Phase 4
```

### 路径 C: 偏 AI 工程路线

```
Phase 0 → Phase 1 → Phase 2 → Phase 4 → Phase 5
```

---

*最后更新: 2026-04-21*
