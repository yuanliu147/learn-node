---
phase: 02
name: 异步与流
duration: 2-3 周
prerequisites: ["phase-01-native-node"]
next_phase: phase-03-framework
version: 1.0
last_updated: 2026-04-21
---

# Phase 02: 异步与流

## 学习目标

完成本阶段后，你应该能够：
- [ ] 深入理解 Promise 的内部实现原理
- [ ] 理解 async/await 的本质是 Generator + Promise
- [ ] 熟练使用 EventEmitter 进行事件驱动编程
- [ ] 理解 Stream 的四种类型及其适用场景
- [ ] 理解背压机制并正确处理
- [ ] 能够实现自定义的 Transform 流

## 知识点清单

### 异步机制

| # | 知识点 | 难度 | 节点文件 | 预计时间 |
|---|--------|------|----------|----------|
| 1 | Promise 内部原理 | L4 | [promise-internals](../02-nodes/02-async/promise-internals.md) | 4h |
| 2 | async/await 转换原理 | L3 | [async-await-transform](../02-nodes/02-async/async-await-transform.md) | 3h |
| 3 | EventEmitter 详解 | L3 | [event-emitter](../02-nodes/02-async/event-emitter.md) | 2h |
| 4 | setTimeout 与 process.nextTick | L2 | [timers-nexttick](../02-nodes/02-async/timers-nexttick.md) | 2h |
| 5 | async_hooks 原理 | L4 | [async-hooks](../02-nodes/02-async/async-hooks.md) | 3h |

### 流系统

| # | 知识点 | 难度 | 节点文件 | 预计时间 |
|---|--------|------|----------|----------|
| 6 | Stream 类型详解 | L3 | [stream-types](../02-nodes/03-stream/stream-types.md) | 3h |
| 7 | 背压机制 | L4 | [backpressure-mechanism](../02-nodes/03-stream/backpressure-mechanism.md) | 3h |
| 8 | pipeline vs pipe | L3 | [pipeline-vs-pipe](../02-nodes/03-stream/pipeline-vs-pipe.md) | 2h |
| 9 | 对象模式 | L3 | [object-mode](../02-nodes/03-stream/object-mode.md) | 2h |
| 10 | 流错误处理 | L3 | [stream-error-handling](../02-nodes/03-stream/stream-error-handling.md) | 2h |

## 实践任务

- [ ] **项目 P1**: 手写一个符合 Promise/A+ 规范的 Promise
- [ ] **项目 P2**: 实现一个限流器（Rate Limiter），使用 EventEmitter
- [ ] **项目 P3**: 实现一个文件处理管道，支持大文件流式处理和背压控制

## 验收标准

1. 能够手写一个 Promise，并解释状态机转换
2. 能够解释 async/await 编译后的代码结构
3. 能够实现一个完整的 EventEmitter（包含 once、removeListener）
4. 能够解释背压产生的原理和解决方案
5. 能够实现一个自定义 Transform 流
6. 通过本阶段的模拟面试

## 常见问题

### Q: Promise.all 中有一个 Promise 失败了，其他会怎样？

A: Promise.all 是 fail-fast 的，一旦有任何一个 Promise reject，Promise.all 就会立即 reject，丢弃其他结果。

### Q: pipeline 和 pipe 有什么区别？

A: pipeline 是 Promise 版本，提供了更好的错误处理（自动 destroy 所有流），而 pipe 是回调版本，错误不会自动传播。

### Q: Transform 流和 Duplex 流有什么区别？

A: Duplex 流同时实现了 Readable 和 Writable，可以独立读写。Transform 流是 Duplex 的特例，它的输入和输出是有因果关系的（Transform）。

## 继续学习

完成 Phase 2 后，你可以进入 [Phase 3: 框架与工程化](phase-03-framework.md)

---

*版本: 1.0 | 最后更新: 2026-04-21*
