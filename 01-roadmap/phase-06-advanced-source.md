---
phase: 06
name: 进阶与源码
duration: 3-4 周
prerequisites: ["phase-05-performance"]
version: 1.0
last_updated: 2026-04-21
---

# Phase 06: 进阶与源码

## 学习目标

完成本阶段后，你应该能够：
- [ ] 理解 Node.js 启动流程和模块加载顺序
- [ ] 理解 libuv 的事件循环 phases 和 Handle 类型
- [ ] 理解线程池的工作原理及 FS/DNS 操作的异步化
- [ ] 理解 io_uring 的原理及在 libuv 中的应用
- [ ] 能够使用 N-API 编写 C++ 原生模块
- [ ] 理解 Cluster 模块的负载均衡策略
- [ ] 理解 IPC 通信和序列化机制

## 知识点清单

### libuv

| # | 知识点 | 难度 | 节点文件 | 预计时间 |
|---|--------|------|----------|----------|
| 1 | uv_run 阶段 | L4 | [uv-run-phases](../02-nodes/07-libuv/uv-run-phases.md) | 3h |
| 2 | Handle 类型 | L4 | [handle-types](../02-nodes/07-libuv/handle-types.md) | 3h |
| 3 | 线程池与 FS/DNS | L4 | [threadpool-fs-dns](../02-nodes/07-libuv/threadpool-fs-dns.md) | 4h |
| 4 | 跨平台 I/O | L4 | [cross-platform-io](../02-nodes/07-libuv/cross-platform-io.md) | 3h |
| 5 | io_uring | L5 | [io-uring](../02-nodes/07-libuv/io-uring.md) | 4h |

### 进阶主题

| # | 知识点 | 难度 | 节点文件 | 预计时间 |
|---|--------|------|----------|----------|
| 6 | Node 启动流程 | L4 | [node-startup-flow](../02-nodes/11-advanced/node-startup-flow.md) | 4h |
| 7 | C++ N-API 绑定 | L4 | [cpp-binding-napi](../02-nodes/11-advanced/cpp-binding-napi.md) | 4h |
| 8 | 线程安全函数 | L5 | [threadsafe-function](../02-nodes/11-advanced/threadsafe-function.md) | 4h |
| 9 | Cluster 负载均衡 | L4 | [cluster-load-balance](../02-nodes/11-advanced/cluster-load-balance.md) | 3h |
| 10 | IPC 序列化 | L4 | [ipc-serialization](../02-nodes/11-advanced/ipc-serialization.md) | 3h |

## 实践任务

- [ ] **项目 P1**: 阅读 Node.js 源码，追踪一个 HTTP 请求的完整处理流程
- [ ] **项目 P2**: 使用 N-API 编写一个计算斐波那契数列的原生模块
- [ ] **项目 P3**: 使用 Cluster 模块实现一个多进程 HTTP 服务器

## 验收标准

1. 能够描述 Node.js 启动时 main 函数到事件循环启动的完整流程
2. 能够解释 libuv 每个 phase 的作用和 Handle/Request 的区别
3. 能够解释线程池大小（UV_THREADPOOL_SIZE）的意义和限制
4. 能够解释 io_uring 相比 epoll 的优势
5. 能够使用 N-API 编写一个简单的原生模块
6. 通过本阶段的模拟面试

## Node.js 源码阅读指南

### 核心源码位置

```
deps/uv/src/unix/core.c      # 事件循环核心
deps/uv/src/unix/stream.c    # Stream 实现
deps/v8/src/                 # V8 引擎
lib/internal/modules/cjs/    # CommonJS 加载器
src/node.cc                  # Node.js 主入口
src/node_contextify.cc       # 上下文和模块封装
```

### 推荐阅读顺序

1. `src/node.cc` → Node.js 入口和初始化
2. `deps/uv/src/unix/core.c` → 事件循环实现
3. `lib/internal/modules/cjs/loader.js` → 模块加载
4. `src/node_contextify.cc` → 模块封装

## 继续学习

完成 Phase 6 后，你已经掌握了 Node.js 的核心知识。可以继续深化：
- 参与 Node.js 核心贡献
- 深入研究特定领域（如网络、安全、工具链）
- 构建自己的框架或工具

---

*版本: 1.0 | 最后更新: 2026-04-21*
