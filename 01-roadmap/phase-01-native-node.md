---
phase: 01
name: 原生 Node.js 基础
duration: 2-3 周
prerequisites: ["JavaScript ES6+", "命令行基础"]
next_phase: phase-02-async-stream
version: 1.0
last_updated: 2026-04-21
---

# Phase 01: 原生 Node.js 基础

## 学习目标

完成本阶段后，你应该能够：
- [ ] 不用任何框架，手写一个 HTTP 服务
- [ ] 解释事件循环的每个 phase 及执行顺序
- [ ] 理解 CommonJS 和 ESM 的区别及互相转换
- [ ] 理解 Node.js 的模块加载机制和缓存策略
- [ ] 熟练使用 Buffer 处理二进制数据
- [ ] 理解 Process 与 Worker Threads 的区别和适用场景

## 知识点清单

| # | 知识点 | 难度 | 节点文件 | 预计时间 |
|---|--------|------|----------|----------|
| 1 | 事件循环 Phase 详解 | L3 | [event-loop-phases](../02-nodes/01-foundation/event-loop-phases.md) | 3h |
| 2 | 微任务与宏任务 | L3 | [microtask-macrotask](../02-nodes/01-foundation/microtask-macrotask.md) | 2h |
| 3 | CommonJS vs ESM | L2 | [commonjs-vs-esm](../02-nodes/01-foundation/commonjs-vs-esm.md) | 2h |
| 4 | 模块加载机制 | L3 | [module-loading](../02-nodes/01-foundation/module-loading.md) | 3h |
| 5 | Buffer 与内存 | L3 | [buffer-memory](../02-nodes/01-foundation/buffer-memory.md) | 2h |
| 6 | Process vs Worker Threads | L3 | [process-vs-worker](../02-nodes/01-foundation/process-vs-worker.md) | 3h |

## 实践任务

- [ ] **项目 P0**: 手写一个简化版 require 函数，理解模块加载流程
- [ ] **项目 P1**: 实现一个并发控制信号量（Semaphore）
- [ ] **项目 P2**: 不依赖任何框架，手写一个 HTTP 服务器，支持路由和静态文件

## 验收标准

1. 能够解释 `setTimeout` 和 `setImmediate` 的执行顺序及原因
2. 能够解释 `process.nextTick` 和 `Promise.then` 的优先级差异
3. 能够描述 CommonJS 和 ESM 在加载时机和缓存策略上的区别
4. 能够手写一个支持基础路由的 HTTP 服务器
5. 通过本阶段的模拟面试

## 常见问题

### Q: 为什么先学原生再学框架？

A: 框架是对原生 API 的封装。只有理解了底层机制，才能更好地理解框架的设计原理，也能更快地排查问题。

### Q: setTimeout(fn, 0) 是立即执行吗？

A: 不是。setTimeout(fn, 0) 会被加入 timers phase，最快也要到下一个事件循环迭代才能执行。如果 timers phase 中有其他回调，会排队等待。

### Q: 为什么 Node.js 能用单线程处理高并发？

A: Node.js 本身是单线程，但 I/O 操作是异步的，由 libuv 的线程池处理。当 I/O 完成时，通过事件循环通知 JavaScript。所以 Node.js 的并发能力来自于异步 I/O，而不是多线程。

## 延伸阅读

- [Node.js 官方文档 - 模块系统](https://nodejs.org/api/modules.html)
- [Node.js 官方文档 - 事件循环](https://nodejs.org/api/event-loop.html)
- [libuv 官方文档](http://docs.libuv.org/)

## 继续学习

完成 Phase 1 后，你可以进入 [Phase 2: 异步与流](phase-02-async-stream.md)

---

*版本: 1.0 | 最后更新: 2026-04-21*
