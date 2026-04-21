---
version: 1.0
last_updated: 2026-04-21
description: 面试高频知识点索引
---

# 面试高频索引 (Interview Hot Index)

> 标记所有面试高频知识点，供面试前快速复习

## 🔥 面试高频概览

| 热度 | 节点数 | 说明 |
|------|--------|------|
| 🔥🔥🔥 | 3 | 极高频，几乎每面必问 |
| 🔥🔥 | 6 | 高频，面试常见 |
| 🔥 | 6 | 中频，偶有问到 |

---

## 🔥🔥🔥 极高频（每面必问）

### 1. event-loop-phases - 事件循环 Phase

**出现场景**: 几乎所有 Node.js 面试第一题

**经典问题**:
```javascript
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
// 问：输出顺序？
```

**追问方向**:
- 事件循环每个 phase 做什么
- 为什么 setTimeout(0) 不等于立即执行
- poll phase 何时会阻塞
- process.nextTick 和微任务的关系

**源码位置**: `deps/uv/src/unix/core.c:uv__run_timers()`

**详细阅读**: [event-loop-phases](../02-nodes/01-foundation/event-loop-phases.md)

---

### 2. microtask-macrotask - 微任务与宏任务

**出现场景**: 事件循环的深度追问

**经典问题**:
```javascript
async function foo() {
  console.log('foo');
}
async function bar() {
  console.log('bar start');
  await foo();
  console.log('bar end');
}
bar();
console.log('global end');
// 问：输出顺序？
```

**追问方向**:
- Promise.then 是微任务还是宏任务
- process.nextTick 和 Promise.then 的优先级
- async/await 的本质

**详细阅读**: [microtask-macrotask](../02-nodes/01-foundation/microtask-macrotask.md)

---

### 3. promise-internals - Promise 内部原理

**出现场景**: 异步编程深入追问

**经典问题**:
- 手写一个 Promise
- Promise.all / Promise.race 的实现
- 描述 Promise 的状态机

**追问方向**:
- Promise 为什么一旦 pending 就不可逆
- .then 和 .catch 的链式调用原理
- 错误处理的传播机制

**详细阅读**: [promise-internals](../02-nodes/02-async/promise-internals.md)

---

## 🔥🔥 高频（面试常见）

### 4. commonjs-vs-esm - 模块系统

**出现场景**: 工程化相关问题

**经典问题**:
- CommonJS 和 ESM 的区别
- 为什么不能动态 import
- 模块循环引用如何处理

**追问方向**:
- require 模块查找路径规则
- 模块缓存机制
- ESM 的 import 提升

**详细阅读**: [commonjs-vs-esm](../02-nodes/01-foundation/commonjs-vs-esm.md)

---

### 5. async-await-transform - async/await 原理

**出现场景**: 异步编程基础

**经典问题**:
- async/await 和 Promise 的关系
- await 后面跟非 Promise 会怎样
- async 函数里面 return 一个值，外部如何获取

**追问方向**:
- async/await 的本质是 Generator + Promise
- await 的错误处理（try/catch vs .catch）

**详细阅读**: [async-await-transform](../02-nodes/02-async/async-await-transform.md)

---

### 6. event-emitter - 事件发射器

**出现场景**: 设计模式相关

**经典问题**:
- 实现一个 EventEmitter
- once 方法如何实现
- 如何处理内存泄漏（removeListener）

**追问方向**:
- 为什么事件名是字符串而不是符号
- newListener 事件的作用

**详细阅读**: [event-emitter](../02-nodes/02-async/event-emitter.md)

---

### 7. timers-nexttick - 定时器

**出现场景**: 事件循环深入

**经典问题**:
- setTimeout(fn, 0) 和 setImmediate 的区别
- process.nextTick 的作用和隐患

**追问方向**:
- 为什么 nextTick 不算作事件循环的一个 phase
- 如何选择 setTimeout 和 nextTick

**详细阅读**: [timers-nexttick](../02-nodes/02-async/timers-nexttick.md)

---

### 8. process-vs-worker - 进程与线程

**出现场景**: Node.js 架构相关

**经典问题**:
- Node.js 是单线程还是多线程
- Worker Threads 和 Child Process 的区别
- Cluster 模块的作用

**追问方向**:
- 为什么 CPU 密集型任务需要 Worker
- 主进程和 Worker 进程如何通信

**详细阅读**: [process-vs-worker](../02-nodes/01-foundation/process-vs-worker.md)

---

### 9. stream-types - 流类型

**出现场景**: I/O 操作相关

**经典问题**:
- 什么是背压，如何处理
- pipe 和 pipeline 的区别
- Transform 流的使用场景

**追问方向**:
- 流在暂停时内部发生了什么
- 如何实现一个自定义流

**详细阅读**: [stream-types](../02-nodes/03-stream/stream-types.md)

---

### 10. http-lifecycle - HTTP 生命周期

**出现场景**: Web 开发基础

**经典问题**:
- 描述一个 HTTP 请求从发起到响应的完整过程
- Keep-Alive 的作用
- HTTP/2 的多路复用

**追问方向**:
- Node.js 如何处理 HTTP 请求
- 如何实现一个简单的 HTTP 服务器

**详细阅读**: [http-lifecycle](../02-nodes/04-network/http-lifecycle.md)

---

## 🔥 中频（偶有问到）

### 11. v8-heap-structure - V8 堆结构

**出现场景**: 内存相关深入

**经典问题**:
- V8 堆分为哪几个区域
- New Space 和 Old Space 的区别
- 新生代和老生代的 GC 算法

**详细阅读**: [v8-heap-structure](../02-nodes/05-memory/v8-heap-structure.md)

---

### 12. memory-leak-patterns - 内存泄漏模式

**出现场景**: 生产环境问题排查

**经典问题**:
- 常见的内存泄漏场景有哪些
- 全局变量和闭包导致的泄漏
- 如何排查内存泄漏

**追问方向**:
- 什么是 v8-profiler
- Heapdump 如何生成和分析

**详细阅读**: [memory-leak-patterns](../02-nodes/05-memory/memory-leak-patterns.md)

---

### 13. express-middleware-chain - Express 中间件链

**出现场景**: Web 框架相关

**经典问题**:
- Express 中间件链是如何工作的
- next() 和 return next() 的区别
- 错误处理中间件如何定义

**追问方向**:
- 中间件的顺序重要吗
- 如何实现一个中间件

**详细阅读**: [express-middleware-chain](../02-nodes/08-framework/express-middleware-chain.md)

---

### 14. prompt-injection-defense - Prompt 注入防御

**出现场景**: AI 应用安全

**经典问题**:
- 什么是 Prompt 注入
- 如何防御 Prompt 注入
- 输入过滤和输出过滤的区别

**追问方向**:
- 实际案例分析
- LLM 安全的其他方面

**详细阅读**: [prompt-injection-defense](../02-nodes/09-ai-backend/prompt-injection-defense.md)

---

### 15. node-startup-flow - Node 启动流程

**出现场景**: 架构深入理解

**经典问题**:
- Node.js 启动时发生了什么
- 模块加载的完整流程
- 为什么 require 比 import 快

**追问方向**:
- Node.js 如何初始化 V8
- 事件循环是在何时启动的

**详细阅读**: [node-startup-flow](../02-nodes/11-advanced/node-startup-flow.md)

---

## 面试复习计划

### 面试前 1 周

| 天 | 内容 | 重点 |
|----|------|------|
| Day 1 | 事件循环三巨头 | event-loop-phases, microtask-macrotask, timers-nexttick |
| Day 2 | 异步编程 | promise-internals, async-await-transform, event-emitter |
| Day 3 | 模块与进程 | commonjs-vs-esm, process-vs-worker, node-startup-flow |
| Day 4 | I/O 模型 | stream-types, http-lifecycle, connection-pool-tuning |
| Day 5 | 内存管理 | v8-heap-structure, memory-leak-patterns, gc |
| Day 6 | 框架与安全 | express-middleware-chain, prompt-injection-defense |
| Day 7 | 系统复习 | 快速过一遍所有 🔥🔥🔥 节点 |

### 面试前 1 天

只复习 🔥🔥🔥 三个节点的：
- 核心原理（能用语言描述清楚）
- 经典代码（能手写出来）
- 追问方向（知道可能的追问及答案）

---

## 手写代码清单

面试中通常需要手写代码的知识点：

| 题目 | 对应节点 | 难度 |
|------|----------|------|
| 实现事件循环 | event-loop-phases | L4 |
| 手写 Promise | promise-internals | L4 |
| 实现 EventEmitter | event-emitter | L3 |
| 实现 Semaphore | concurrency-control | L3 |
| 实现限流器 | token-rate-limit | L3 |
| 实现流式处理器 | stream-types | L4 |

详细清单请查看: [04-interview/coding-handwriting.md](../04-interview/coding-handwriting.md)

---

## 系统设计题关联

| 系统设计题 | 关联知识节点 |
|------------|--------------|
| 设计一个 LLM 网关 | sse-streaming, concurrency-control, token-rate-limit, prompt-injection-defense |
| 设计一个 RAG 服务 | rag-pipeline, embedding-vector-store, concurrency-control |
| 设计一个实时聊天 | websocket-internals, http-lifecycle, stream-types |
| 设计一个爬虫系统 | stream-types, backpressure-mechanism, concurrency-control |

---

*最后更新: 2026-04-21*
