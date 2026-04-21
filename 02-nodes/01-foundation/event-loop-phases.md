---
id: event-loop-phases
title: 事件循环 Phase 详解
difficulty: L3
tags: ["event-loop", "libuv", "core", "interview-hot"]
prerequisites: ["javascript-single-thread"]
related: ["timers-nexttick", "microtask-macrotask", "uv-run-phases"]
interview_hot: true
ai_confidence: 4
version: 2.0
last_updated: 2026-04-21
human_verified: false
todo:
  - 补充 Windows IOCP 与 libuv 的差异
  - 添加 io_uring 对事件循环的影响
---

# 事件循环 Phase 详解

## 一句话定义

> Node.js 的事件循环是 libuv 实现的一个**分阶段处理异步回调**的机制，每个 phase 都有独立的队列，JavaScript 代码永远在主线程执行。

---

## 解决什么问题

### 核心问题：单线程如何处理高并发 I/O？

```
传统方式（多线程/多进程）：
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Thread1 │  │ Thread2 │  │ Thread3 │  ← 每个连接一个线程
│ ────────│  │ ────────│  │ ────────│
│ Stack   │  │ Stack   │  │ Stack   │
│ 4KB+    │  │ 4KB+    │  │ 4KB+    │
└─────────┘  └─────────┘  └─────────┘
问题：线程创建/切换开销大，内存消耗严重

Node.js 方式（单线程 + 事件循环）：
┌─────────────────────────────────────┐
│         Main Thread (Single)         │
│  ┌─────────────────────────────────┐│
│  │       Event Loop (C++ libuv)    ││
│  │  ┌──────┐ ┌──────┐ ┌──────────┐ ││
│  │  │Timer │→│ Poll │→│  Check   │ ││
│  │  └──────┘ └──────┘ └──────────┘ ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │       JavaScript (V8)           ││
│  │   永远单线程，代码顺序执行        ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
        ↓ I/O 异步化（libuv 线程池）
┌─────────────────────────────────────┐
│       Thread Pool (libuv)           │
│  ┌────────┐ ┌────────┐ ┌────────┐  │
│  │Thread 1│  │Thread 2│  │Thread N│  │
│  └────────┘ └────────┘ └────────┘  │
└─────────────────────────────────────┘
```

### 设计哲学

**"Don't block the event loop"** — 这是 Node.js 架构的黄金法则。

- **优点**：单线程，无锁，I/O 异步化，内存占用低
- **代价**：CPU 密集型任务会阻塞整个应用

---

## 架构设计

### Phase 详解

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         libuv 事件循环 (uv_run)                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌────────────┐                                                          │
│   │  timers    │  ← setTimeout(callback, ms)                              │
│   │  phase     │    setInterval(callback, ms)                             │
│   │            │    【时机】达到指定时间后执行                              │
│   └─────┬──────┘                                                          │
│         │                                                                  │
│         ▼                                                                  │
│   ┌────────────┐                                                          │
│   │ pending    │  ← 某些系统操作（如 TCP 错误）的回调延迟                   │
│   │ callbacks  │    【时机】poll phase 产生的错误延迟到下一个 loop          │
│   └─────┬──────┘                                                          │
│         │                                                                  │
│         ▼                                                                  │
│   ┌────────────┐                                                          │
│   │ idle,      │  ← libuv/Noded 内部使用                                   │
│   │ prepare    │    【用途】准备阶段，更新内部状态                          │
│   └─────┬──────┘                                                          │
│         │                                                                  │
│         ▼                                                                  │
│   ┌────────────────────────────────────────────────────────────┐          │
│   │                      poll phase                             │          │
│   │  ┌──────────────────────────────────────────────────────┐  │          │
│   │  │ • 等待 I/O 事件（epoll/kqueue/IOCP）                │  │          │
│   │  │ • 如果没有 I/O → 检查 timers → 进入 check phase     │  │          │
│   │  │ • 如果有 I/O → 执行对应的回调                        │  │          │
│   │  └──────────────────────────────────────────────────────┘  │          │
│   └─────┬──────────────────────────────────────────────────────┘          │
│         │                                                                  │
│         ▼                                                                  │
│   ┌────────────┐                                                          │
│   │  check     │  ← setImmediate(callback)                               │
│   │  phase     │    【时机】poll phase 空转或完成后立即执行                 │
│   └─────┬──────┘                                                          │
│         │                                                                  │
│         ▼                                                                  │
│   ┌────────────┐                                                          │
│   │  close     │  ← socket.on('close')                                  │
│   │  callbacks │    【时机】资源关闭时的回调                               │
│   └────────────┘                                                          │
│                                                                            │
│   ═══════════════════════════════════════════════════════════════════════  │
│   │                      微任务队列（每轮 loop 结束后清空）                 │  │
│   │   Promise.then / process.nextTick / queueMicrotask                   │  │
│   ═══════════════════════════════════════════════════════════════════════  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 与浏览器事件循环的关键差异

| 维度 | Node.js | 浏览器 |
|------|---------|--------|
| 宏任务队列 | **多个**（按 phase 分散） | **单个**（task queue） |
| 微任务 | **每个 phase 后清空** | **每个宏任务后清空** |
| nextTick | Node 特有（比其他微任务先执行） | 无 |
| setImmediate | Node 特有（poll 后执行） | 无 |
| 精度 | 依赖系统时间（通常 1ms） | 依赖浏览器实现 |

---

## 优劣势分析

### ✅ 优势

| 优势 | 说明 |
|------|------|
| **无锁编程** | 单线程天然避免竞态条件，不需要锁 |
| **低内存开销** | 每个连接不需要独立线程栈（~4KB+） |
| **高 I/O 吞吐** | 适合 I/O 密集型（数据库、文件、网络） |
| **生态丰富** | npm 生态，大量异步库 |
| **统一技术栈** | 前端 JS + 后端 JS |

### ❌ 劣势

| 劣势 | 说明 |
|------|------|
| **CPU 密集型瓶颈** | 无法利用多核，大计算会阻塞 |
| **单进程容错** | 一个未捕获异常导致整个进程崩溃 |
| **生态碎片** | 异步回调容易产生"回调地狱" |
| **调试困难** | 异步堆栈跟踪不连续 |

### ⚠️ 适用场景

| 场景 | 适合？ | 原因 |
|------|--------|------|
| REST API 服务器 | ✅ | I/O 为主，并发高 |
| 实时聊天/推送 | ✅ | 长连接，事件驱动 |
| 微服务间通信 | ✅ | 网络 I/O 为主 |
| 图片处理（CPU重） | ❌ | 应使用 Worker Threads 或 Cluster |
| 科学计算 | ❌ | CPU 密集，应选多进程方案 |
| 游戏服务器（状态同步） | ⚠️ | 需要仔细评估锁策略 |

---

## 代码演示

### setTimeout vs setImmediate 顺序

```javascript
// 经典问题：谁先执行？
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));

// 在 I/O 回调中：
fs.readFile('test.txt', () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
  // 结论：在 I/O 回调中，setImmediate 几乎总是先执行
});
```

**原因**：
- `setTimeout` 进入 **timers phase**
- `setImmediate` 进入 **check phase**
- I/O 回调后先进入 poll phase → 发现有 setImmediate → 跳到 check phase

### process.nextTick 的特殊地位

```javascript
setTimeout(() => console.log('timeout'), 0);
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));

// 输出顺序：
// nextTick → promise → timeout
```

**原因**：
```
每轮 loop 结束后，清空微任务队列的顺序是：
1. nextTick 队列（所有）
2. Promise 微任务队列（所有）
3. 才开始下一轮 loop

所以 nextTick 比 Promise.then 优先级更高
```

---

## 深度扩展

### 1. poll phase 的阻塞行为

```javascript
// 如果 poll phase 没有 I/O 事件，它会等待...
// 但如果有 setTimeout 时间到了，它会跳出等待

// 伪代码逻辑：
while (running) {
  // timers phase: 执行到期的 setTimeout
  uv__run_timers(loop);

  // pending callbacks phase
  uv__run_pending(loop);

  // idle/prepare (内部)
  uv__run_idle(loop);
  uv__run_prepare(loop);

  // poll phase
  timeout = uv__backend_timeout(loop);  // 计算等待时间
  uv__io_poll(loop, timeout);          // 等待 I/O（可能阻塞）

  // check phase
  uv__run_check(loop);

  // close callbacks
  uv__run_close(loop);
}
```

**关键**：poll phase 的 timeout 计算
- 如果有到期的 timers → timeout = 0（立即返回）
- 如果没有 → timeout = -1（无限等待，直到有 I/O）
- **这就是为什么没有 I/O 时 Node 不会空转 CPU**

### 2. 为什么不能在事件循环中阻塞？

```javascript
// ❌ 错误示例：阻塞事件循环
const result = heavyCalculation(); // 假设需要 10 秒

// ✅ 正确做法：使用 Worker Threads
const { Worker } = require('worker_threads');
const worker = new Worker('./calc.js', { workerData: input });
worker.on('message', result => console.log(result));
```

---

## 面试题

### Q1: setTimeout(fn, 0) 和 setImmediate 谁先执行？

**答案**：不一定，取决于调用上下文

```javascript
// 在全局作用域：setTimeout 几乎总是先执行
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
// 输出：timeout → immediate（大多数情况）

// 在 I/O 回调中：setImmediate 几乎总是先执行
fs.readFile('...', () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
});
// 输出：immediate → timeout（几乎总是）
```

**追问**：如果在 readFile 之前有大量同步代码呢？
**答案**：仍然可能是 setTimeout 先执行，因为 timers 有最小延迟（~1ms）

---

### Q2: 以下代码输出顺序是什么？

```javascript
console.log('1');

setTimeout(() => console.log('2'), 0);

Promise.resolve().then(() => {
  console.log('3');
  process.nextTick(() => console.log('4'));
});

process.nextTick(() => console.log('5'));

console.log('6');

// 输出顺序：1 → 6 → 5 → 3 → 4 → 2
```

**解析**：
1. 同步代码先执行：`1` → `6`
2. 主线程清空：`5` (nextTick)
3. 第一轮 loop 结束前清空微任务：`3` → `4`
4. 进入下一轮 loop：`2`

---

### Q3: Node.js 和浏览器的事件循环有什么区别？

**答案要点**：
1. Node 有多个宏任务队列（按 phase），浏览器只有一个 task queue
2. Node 的微任务在每个 phase 结束后清空，浏览器的微任务在每个宏任务后清空
3. Node 有 process.nextTick 和 setImmediate，浏览器没有
4. Node 用 libuv，浏览器用 HTML 规范定义的事件循环

---

## 常见误区

| 误区 | 正确理解 |
|------|----------|
| ❌ `setTimeout(fn, 0)` = 立即执行 | ✅ 实际上至少延迟到下一个 timers phase（约 1ms） |
| ❌ 事件循环是 JavaScript 实现的 | ✅ 事件循环是 libuv（C 语言）实现的，JavaScript 只是注册回调 |
| ❌ 微任务在每个 phase 后清空 | ✅ 微任务在**每轮 loop 结束后**清空，不是在每个 phase 后 |
| ❌ Node.js 是完全单线程 | ✅ JavaScript 执行是单线程，但 libuv 线程池处理 I/O |
| ❌ 所有 I/O 都是异步的 | ✅ DNS 查询、文件 I/O 在 libuv 线程池执行，但有些操作（如 fs.statSync）仍然是同步的 |

---

## 延伸阅读

### 官方文档
- [Node.js 事件循环文档](https://nodejs.org/api/event-loop.html)
- [libuv 官方文档](http://docs.libuv.org/en/v1.x/design.html)

### 源码位置
- `deps/uv/src/unix/core.c:uv_run()` — 事件循环主循环
- `deps/uv/src/unix/timer.c:uv__run_timers()` — timers phase 实现
- `lib/internal/bootstrap/node.js` — Node.js 启动时的事件循环初始化

### 经典博客
- [The Node.js Event Loop: Not Just a Black Box](https://blog.nodesource.com/the-nodejs-event-loop/)
- [libuv 设计概述](https://nikhilm.github.io/uvbook/)

---

## 相关节点

- [ timers-nexttick ](timers-nexttick.md) — setTimeout 和 nextTick 的细节
- [ microtask-macrotask ](microtask-macrotask.md) — 微任务与宏任务的区别
- [ uv-run-phases ](../07-libuv/uv-run-phases.md) — libuv 层面的 phase 详解
