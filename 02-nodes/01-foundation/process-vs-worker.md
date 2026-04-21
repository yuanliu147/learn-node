---
id: process-vs-worker
title: Process vs Worker Threads
difficulty: L3
tags: ["worker", "process", "cluster", "parallelism"]
prerequisites: ["event-loop-phases"]
related: ["cluster-load-balance", "threadsafe-function", "cpp-binding-napi"]
interview_hot: true
ai_confidence: 4
version: 2.0
last_updated: 2026-04-21
human_verified: false
todo:
  - 补充 SharedArrayBuffer 的实际使用场景
  - 添加 Worker Threads 与 Worker Pool 的对比
---

# Process vs Worker Threads vs Cluster

## 一句话定义

> Node.js 单线程执行 JavaScript，但通过 **Child Process**（多进程）、**Worker Threads**（多线程）、**Cluster**（多进程+负载均衡）三种机制实现并行计算。

---

## 解决什么问题

### 核心问题：Node.js 单线程如何利用多核 CPU？

```
单进程问题：
                    CPU Cores
                 ┌──┬──┬──┬──┐
                 │  │  │  │  │  ← 只用 1 个 core
                 │  │  │  │  │
应用进程 ──────► │100%│  │  │  │  
                 │  │  │  │  │  
                 └──┴──┴──┴──┘
                 
其他 core 空闲（浪费 87.5% on 8-core）
```

Node.js 的演进路径：
```
┌─────────────────────────────────────────────────────────────────────┐
│                        Node.js 并行化演进                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 1: 单进程时代                                                 │
│  ┌─────────┐                                                       │
│  │ JS 单线程│  ← 只能用一个 core                                     │
│  └─────────┘                                                       │
│                                                                     │
│  Phase 2: Child Process                                             │
│  ┌─────────┐  fork()  ┌─────────┐                                  │
│  │ Parent  │─────────►│ Child   │  ← 完全独立的 V8 实例              │
│  └─────────┘          └─────────┘  ← 通信靠 IPC                     │
│                                                                     │
│  Phase 3: Worker Threads                                            │
│  ┌─────────────────────────────────────────┐                       │
│  │ Main Thread (V8)                         │                       │
│  │  ┌─────────┐                            │                       │
│  │  │ JS Code │                            │                       │
│  │  └────┬────┘                            │                       │
│  │       │ Worker Threads                   │                       │
│  │  ┌────┴────┐  ┌─────────┐             │                       │
│  │  │ Message │◄─►│ Worker  │             │                       │
│  │  │  Port   │   │ Thread  │  ← 共享 V8  │                       │
│  │  └─────────┘   └─────────┘   (可选共享内存) │                       │
│  └─────────────────────────────────────────┘                       │
│                                                                     │
│  Phase 4: Cluster                                                  │
│  ┌──────────────┐  ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Master       │──│ Worker  │─│ Worker  │─│ Worker  │           │
│  │ (负载均衡)   │  └─────────┘ └─────────┘ └─────────┘           │
│  └──────────────┘  ← 每个 worker 是独立进程                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 架构设计

### 1. Child Process（child_process 模块）

**设计思想**：完全隔离的进程，通过 IPC 通信

```
┌─────────────────────────────────────────────────────────────┐
│                    Child Process 架构                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Parent Process              Child Process                  │
│   ┌───────────────┐          ┌───────────────┐            │
│   │               │          │               │            │
│   │  独立的 V8    │          │  独立的 V8    │            │
│   │  独立堆内存   │          │  独立堆内存   │            │
│   │  独立事件循环 │          │  独立事件循环 │            │
│   │               │  IPC     │               │            │
│   │  stdin/stdout│◄────────►│  stdin/stdout│            │
│   │  message     │          │  message     │            │
│   │               │          │               │            │
│   └───────────────┘          └───────────────┘            │
│                                                             │
│   通信方式：                                              │
│   - fork(): IPC channel (message)                         │
│   - spawn(): stdin/stdout pipe                            │
│   - exec(): shell 命令                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**创建方式对比**：

| 方法 | 使用场景 | 通信方式 | 是否 Node.js |
|------|----------|---------|--------------|
| `fork()` | 衍生 Node.js 子进程 | IPC (message) | ✅ |
| `spawn()` | 任何可执行程序 | stdio pipe | ❌ |
| `exec()` | 执行 shell 命令 | callback | ❌ |
| `execFile()` | 直接执行文件 | callback | ❌ |

```javascript
// fork() - 创建 Node.js 子进程
const child = fork('./child.js');
child.on('message', (msg) => console.log('Parent got:', msg));
child.send({ from: 'parent' });

// child.js
process.on('message', (msg) => console.log('Child got:', msg));
process.send({ from: 'child' });

// spawn() - 启动任何可执行程序
const py = spawn('python', ['script.py']);
py.stdout.on('data', (data) => console.log(data.toString()));

// exec() - 执行 shell 命令
exec('ls -la | grep node', (error, stdout, stderr) => {
  console.log(stdout);
});
```

### 2. Worker Threads（worker_threads 模块）

**设计思想**：共享 V8 堆，通过 MessagePort 通信，可选共享内存

```
┌─────────────────────────────────────────────────────────────┐
│                    Worker Threads 架构                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Main Thread                                               │
│   ┌───────────────────────────────────────────────────┐   │
│   │                                                    │   │
│   │  V8 Instance (Isolate)                             │   │
│   │  ┌─────────────────────────────────────────────┐  │   │
│   │  │                                             │  │   │
│   │  │   JavaScript Code                           │  │   │
│   │  │                                             │  │   │
│   │  └─────────────────────────────────────────────┘  │   │
│   │                                                    │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │   │
│   │  │ Worker 1 │  │ Worker 2 │  │ Worker N │      │   │
│   │  │ (Thread) │  │ (Thread) │  │ (Thread) │      │   │
│   │  └────┬─────┘  └────┬─────┘  └────┬─────┘      │   │
│   │       │              │              │             │   │
│   │       └──────────────┼──────────────┘             │   │
│   │                      │                            │   │
│   │              Message Port                         │   │
│   │                      │                            │   │
│   │       Optional: SharedArrayBuffer                 │   │
│   │       ┌─────────────────────────────────────┐    │   │
│   │       │  Shared Memory (TypedArrays)        │    │   │
│   │       └─────────────────────────────────────┘    │   │
│   └───────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```javascript
// worker_threads 基本用法
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
  // 主线程
  const worker = new Worker(__filename, {
    workerData: { start: 0, end: 1000000 }
  });
  
  worker.on('message', (result) => {
    console.log('Result:', result);
  });
  
  worker.on('error', (err) => {
    console.error('Worker error:', err);
  });
} else {
  // Worker 线程
  const { start, end } = workerData;
  const result = heavyCalculation(start, end);
  parentPort.postMessage(result);
}
```

### 3. Cluster（cluster 模块）

**设计思想**：Master-Worker 模式，共享端口，负载均衡

```
┌─────────────────────────────────────────────────────────────┐
│                      Cluster 架构                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    Master Process                           │
│                    ┌───────────┐                           │
│                    │           │                           │
│                    │  共享端口  │                           │
│                    │  负载均衡  │                           │
│                    │           │                           │
│                    └─────┬─────┘                           │
│                          │                                  │
│         ┌────────────────┼────────────────┐               │
│         │                │                │               │
│         ▼                ▼                ▼               │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│   │ Worker 1 │    │ Worker 2 │    │ Worker N │          │
│   │ (PID xxx)│    │ (PID xxx)│    │ (PID xxx)│          │
│   │          │    │          │    │          │          │
│   │ Event    │    │ Event    │    │ Event    │          │
│   │ Loop     │    │ Loop     │    │ Loop     │          │
│   └──────────┘    └──────────┘    └──────────┘          │
│                                                             │
│   负载均衡策略：                                            │
│   - Round Robin (默认，Linux/Unix)                         │
│   - Shared Socket (Windows)                                │
│   - 自定义 (通过 message 传递)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```javascript
const cluster = require('cluster');
const http = require('http');

if (cluster.isMaster) {
  // Master: 创建 workers
  const numCPUs = require('os').cpus().length;
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork(); // 重启
  });
} else {
  // Worker: 处理请求
  http.createServer((req, res) => {
    res.end(`Handled by worker ${process.pid}`);
  }).listen(8000);
}
```

---

## 优劣势分析

### Child Process

| 维度 | 分析 |
|------|------|
| **隔离性** | ✅✅ 完全隔离，一个崩溃不影响其他 |
| **通信开销** | ❌❌ IPC 序列化和反序列化开销大 |
| **内存开销** | ❌❌ 每个进程独立的 V8 堆（~30MB+） |
| **启动速度** | ❌ 进程创建比线程慢 |
| **适用场景** | 需执行系统命令、运行其他语言代码、需要完全隔离 |

### Worker Threads

| 维度 | 分析 |
|------|------|
| **隔离性** | ✅ 共享 V8，但 JavaScript 执行隔离 |
| **通信开销** | ✅ MessagePort 开销小（零拷贝） |
| **内存开销** | ✅ 可选共享内存，不需要完整 V8 副本 |
| **启动速度** | ✅ 线程创建比进程快 |
| **适用场景** | CPU 密集型计算、需要高频通信 |

### Cluster

| 维度 | 分析 |
|------|------|
| **隔离性** | ✅✅ 完全隔离 |
| **负载均衡** | ✅✅ 内置 |
| **资源共享** | ✅ 共享端口 |
| **容错** | ✅ 进程崩溃后自动重启 |
| **适用场景** | HTTP 服务器、需要利用多核、容错 |

---

## 选型决策树

```
                    开始
                      │
                      ▼
            ┌─────────────────────┐
            │ 需要利用多核？       │
            └─────────┬───────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
         Yes                     No
          │                       │
          ▼                       ▼
   ┌─────────────┐         ┌─────────────┐
   │ 是 HTTP    │         │ 单进程足够   │
   │ 服务器？   │          └─────────────┘
   └──────┬──────┘
          │
    ┌─────┴─────┐
    │           │
   Yes         No
    │           │
    ▼           ▼
┌────────┐  ┌─────────────────┐
│Cluster │  │ CPU 密集型？    │
│        │  └────────┬────────┘
└────────┘           │
              ┌──────┴──────┐
              │             │
             Yes           No
              │             │
              ▼             ▼
        ┌──────────┐  ┌──────────┐
        │  Worker  │  │  检查其他 │
        │ Threads  │  │  异步方案 │
        └──────────┘  └──────────┘
```

---

## 代码演示

### CPU 密集型：Worker Threads vs 单线程

```javascript
// benchmark.js - 测试 Worker Threads 的加速效果
const { Worker } = require('worker_threads');

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// 单线程版本
console.time('single');
console.log(fibonacci(40));
console.timeEnd('single');

// Worker 版本
console.time('worker');
const worker = new Worker(`
  const { parentPort, workerData } = require('worker_threads');
  function fib(n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
  }
  parentPort.postMessage(fib(workerData));
`, { eval: true, workerData: 40 });

worker.on('message', (result) => {
  console.log(result);
  console.timeEnd('worker');
  process.exit(0);
});
```

### 进程间共享内存（SharedArrayBuffer）

```javascript
// shared-memory.js
const { Worker } = require('worker_threads');
const sharedBuffer = new SharedArrayBuffer(4 * 1000000); // 4MB
const sharedArray = new Int32Array(sharedBuffer);

// 主线程设置初始值
for (let i = 0; i < 1000000; i++) {
  sharedArray[i] = i;
}

// Worker 线程读取
const worker = new Worker(`
  const { parentPort } = require('worker_threads');
  // 在 Worker 中访问共享内存
  // ...
`, { eval: true });

worker.postMessage({ sharedBuffer }, [sharedBuffer]); // Transferable
```

---

## 常见误区

| 误区 | 正确理解 |
|------|----------|
| ❌ Worker Threads 是多线程所以完全安全 | ✅ Worker Threads 共享 V8 实例，JS 代码执行仍是并发的，存在竞态 |
| ❌ Cluster 就是多进程 | ✅ Cluster 底层是 child_process.fork()，每个 worker 是独立进程 |
| ❌ Child Process 比 Worker Threads 更好 | ✅ 看场景：完全隔离选 Process，需要频繁通信选 Threads |
| ❌ Worker Threads 可以共享所有数据 | ✅ 只能共享 TypedArrays 和 ArrayBuffer，普通对象需要序列化 |

---

## 延伸阅读

### 官方文档
- [child_process 模块](https://nodejs.org/api/child_process.html)
- [worker_threads 模块](https://nodejs.org/api/worker_threads.html)
- [cluster 模块](https://nodejs.org/api/cluster.html)

### 源码位置
- `lib/child_process.js` — Child Process 实现
- `lib/worker_threads/` — Worker Threads 实现
- `lib/cluster.js` — Cluster 实现

---

## 相关节点

- [ cluster-load-balance ](../11-advanced/cluster-load-balance.md) — Cluster 负载均衡细节
- [ threadsafe-function ](../11-advanced/threadsafe-function.md) — 线程安全函数
- [ cpp-binding-napi ](../11-advanced/cpp-binding-napi.md) — N-API 原生模块
