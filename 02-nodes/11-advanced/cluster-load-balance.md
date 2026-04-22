---
title: "集群架构与负载均衡"
description: "Node.js 集群架构分析：基于进程的并行设计、负载均衡策略选择和技术权衡"
tags:
  - nodejs
  - cluster
  - architecture
  - technology-selection
  - load-balancing
  - scalability
related:
  - ipc-serialization
  - event-loop-phases
  - node-startup-flow
---

# 集群架构与负载均衡

Node.js 运行在单线程事件循环中，这意味着**一个进程只能使用一个 CPU 核心**。这不是一个 bug——而是一个深思熟虑的架构选择。理解其中的原因需要审视塑造 Node.js 的技术决策，以及集群如何解决多核利用率问题。

## 单线程约束：架构决策

```
┌─────────────────────────────────────────────────────────────────┐
│          为什么 Node.js 选择单线程设计                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   原始问题 (2009):                                              │
│   ├── Web 服务器在 I/O 上阻塞                                    │
│   ├── 每个连接 = 一个线程 = 显著的内存开销                        │
│   ├── C10K 问题：10,000 个连接 = 10,000 个线程 = 崩溃             │
│   └── 由于 I/O 等待，CPU 利用率很低                               │
│                                                                 │
│   解决方案：事件驱动、非阻塞 I/O                                   │
│   ├── 单线程通过事件循环处理多个连接                               │
│   ├── I/O 操作在等待时释放线程                                   │
│   ├── CPU 时间用于实际计算，而不是等待                             │
│   └── 可以实现数百万并发连接                                      │
│                                                                 │
│   接受的权衡：                                                   │
│   └── 单线程 = 单个 CPU 核心利用                                 │
│       └── 解决方案：集群模块用于水平扩展                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 问题可视化

```
┌─────────────────────────────────────────────────────────────────┐
│              单进程限制                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   进程（单线程事件循环）                                           │
│   ┌─────────────────────────────────────┐                       │
│   │                                     │                       │
│   │   事件循环                           │                       │
│   │   ┌─────────────────────────────┐   │                       │
│   │   │  CPU 核心 1 (100%)          │   │  ← 只使用 1 个核心    │
│   │   └─────────────────────────────┘   │                       │
│   │   CPU 核心 2-7: 空闲                │                       │
│   │                                     │                       │
│   └─────────────────────────────────────┘                       │
│                                                                 │
│   在 8 核系统上：87.5% 的 CPU 浪费！                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 集群架构

### 技术选型：为什么选择基于进程的集群？

```
┌─────────────────────────────────────────────────────────────────┐
│          集群模块：架构决策                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   设计决策：基于进程（而不是基于线程）                             │
│                                                                 │
│   为什么选择进程？                                                │
│   ├── JS 是单线程的——线程仍然共享 CPU                            │
│   ├── V8 堆不是线程安全的                                         │
│   ├── 一个 worker 崩溃不会影响其他 worker                        │
│   ├── worker 之间内存隔离清晰                                     │
│   └── 本地附加组件（C++）通常不是线程安全的                        │
│                                                                 │
│   为什么不选择线程？                                              │
│   ├── 线程同步增加复杂性                                         │
│   ├── 共享状态需要锁（死锁风险）                                   │
│   ├── 调试多线程 JS 极其困难                                     │
│   └── 线程间的内存共享复杂                                         │
│                                                                 │
│   权衡：                                                         │
│   ├── 进程间通信（IPC）开销                                       │
│   ├── 比线程更高的内存使用                                         │
│   └── 默认不共享内存                                              │
│       └── 使用外部存储（Redis）来共享状态                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 集群架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    集群架构                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                         主进程                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  职责：                                                  │   │
│   │  ├── 监听共享端口                                        │   │
│   │  ├── 接受传入连接                                        │   │
│   │  ├── 分发到 worker（负载均衡器）                         │   │
│   │  └── 管理 worker 生命周期（fork、restart、kill）        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                    │
│          ┌───────────────────┼───────────────────┐                │
│          │                   │                   │                │
│          ▼                   ▼                   ▼                │
│   ┌────────────┐       ┌────────────┐       ┌────────────┐   │
│   │  Worker 1  │       │  Worker 2  │       │  Worker N  │   │
│   │  (PID 123) │       │  (PID 456) │       │  (PID 789) │   │
│   │            │       │            │       │            │   │
│   │  事件       │       │  事件       │       │  事件       │   │
│   │  循环       │       │  循环       │       │  循环       │   │
│   │            │       │            │       │            │   │
│   │  处理       │       │  处理       │       │  处理       │   │
│   │  连接       │       │  连接       │       │  连接       │   │
│   │  子集       │       │  子集       │       │  子集       │   │
│   └────────────┘       └────────────┘       └────────────┘   │
│                                                                 │
│   每个 worker 都是一个完整的 Node.js 进程，具有：                  │
│   ├── 独立的 V8 实例                                             │
│   ├── 独立的事件循环                                             │
│   ├── 独立的内存空间                                             │
│   └── 独立的 I/O 处理                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 负载均衡：技术决策

### 为什么轮询是默认值

```
┌─────────────────────────────────────────────────────────────────┐
│          负载均衡策略选择                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   策略 1：轮询（Linux/macOS 默认）                               │
│   ├── 优点：简单，主进程不需要状态                                │
│   ├── 优点：负载均匀时分布均匀                                    │
│   ├── 优点：OS 级支持通过 SO_REUSEPORT                           │
│   └── 缺点：不考虑 worker 负载差异                               │
│                                                                 │
│   策略 2：最少连接（不是内置）                                    │
│   ├── 优点：更适合请求持续时间不同的情况                          │
│   ├── 优点：适应 worker 负载差异                                 │
│   ├── 缺点：需要跟踪每个 worker 的活动连接                        │
│   └── 缺点：更复杂，必须通过 IPC 实现                             │
│                                                                 │
│   策略 3：IP 哈希（粘性会话）                                     │
│   ├── 优点：同一客户端 → 同一 worker                             │
│   ├── 优点：会话数据不需要共享存储                                 │
│   ├── 缺点：如果客户端使用模式不同，分布不均匀                     │
│   └── 缺点：worker 故障需要重新建立会话                          │
│                                                                 │
│   为什么轮询成为默认选择：                                         │
│   ├── 简单：不需要状态跟踪                                       │
│   ├── 性能：OS 处理分发（SO_REUSEPORT）                          │
│   └── 公平：适用于同构工作负载                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 按操作系统的负载均衡实现差异

```
┌─────────────────────────────────────────────────────────────────┐
│              OS 级负载均衡                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Linux / macOS: SO_REUSEPORT                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │   客户端                                                 │   │
│   │      │                                                   │   │
│   │      │ TCP SYN                                          │   │
│   │      ▼                                                   │   │
│   │   OS 内核（带 SO_REUSEPORT）                            │   │
│   │      │                                                   │   │
│   │      │ OS 直接分发到 worker                             │   │
│   │      │（主进程可能不参与！）                              │   │
│   │      ▼                                                   │   │
│   │   Worker（任意可用的）                                   │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Windows: SCHED_ROUND_ROBIN                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │   客户端                                                 │   │
│   │      │                                                   │   │
│   │      │ TCP SYN                                          │   │
│   │      ▼                                                   │   │
│   │   主进程                                                │   │
│   │      │                                                   │   │
│   │      │ 主进程接受，然后通过 IPC 调度到 worker           │   │
│   │      ▼                                                   │   │
│   │   Worker                                                │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   性能影响：                                                      │
│   ├── Linux：延迟更低（无主进程参与）                             │
│   └── Windows：延迟稍高，但分发更安全                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 基本集群使用与架构上下文

### 简单轮询集群

```javascript
const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;

// 架构：isPrimary（原 isMaster）表示主进程
// 主进程协调 workers，workers 处理实际请求
if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);
    
    // Fork workers - 每个获得自己的 V8 实例、事件循环
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    // Worker 死亡处理 - 自动重新生成
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        // 架构：当 isShuttingDown 时 Fork 返回 null
        if (!worker.exitedAfterDisconnect) {
            cluster.fork();
        }
    });
    
} else {
    // Worker 进程 - HTTP 服务器
    // 注意：每个 worker 有自己的事件循环，无共享状态
    http.createServer((req, res) => {
        res.writeHead(200);
        res.end(`Handled by worker ${process.pid}\n`);
    }).listen(8000);
    
    console.log(`Worker ${process.pid} started`);
}
```

### 连接分发流程

```
┌─────────────────────────────────────────────────────────────────┐
│              连接分发流程                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   客户端                                                         │
│      │                                                          │
│      │ TCP SYN                                                  │
│      ▼                                                          │
│   主进程（监听 socket）                                          │
│      │                                                          │
│      │ 在 Linux 上使用 SO_REUSEPORT：                            │
│      │ - OS 直接分发到 worker                                   │
│      │ - 初始连接后主进程可能不参与                               │
│      │                                                          │
│      │ 在 Windows 上或不使用 SO_REUSEPORT：                     │
│      │ - 主进程接受连接                                          │
│      │ - 主进程通过 IPC 将 socket 传递给 worker                 │
│      │                                                          │
│      ▼                                                          │
│   Worker 进程                                                   │
│      │                                                          │
│      │ 处理 HTTP 请求                                           │
│      │                                                          │
└─────────────────────────────────────────────────────────────────┘
```

## 进程间通信（IPC）架构

### 为什么需要 IPC

```
┌─────────────────────────────────────────────────────────────────┐
│              IPC 架构设计                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   问题：Workers 是具有独立内存的独立进程                          │
│                                                                 │
│   解决方案：通过 OS 提供的通道（管道、unix socket）的 IPC         │
│                                                                 │
│   Node.js 集群中的 IPC 模式：                                    │
│                                                                 │
│   1. 主进程 → Worker 消息                                       │
│      worker.send({ type: 'command', action: 'reload' });       │
│                                                                 │
│   2. Worker → 主进程消息                                        │
│      process.send({ type: 'status', data: myData });         │
│                                                                 │
│   3. 双向（通过 handle 传递）                                    │
│      worker.send('sticky-session', socket);                    │
│                                                                 │
│   架构：                                                         │
│   ├── IPC 底层使用 libuv                                       │
│   ├── 消息被序列化（默认 JSON）                                  │
│   ├── 可以传递文件描述符（零拷贝）                               │
│   └── 大消息可能导致性能问题                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### IPC 实现

```javascript
// 主进程 - 向 workers 发送消息
if (cluster.isPrimary) {
    const worker = cluster.fork();
    
    // 向特定 worker 发送消息
    worker.send({ type: 'command', action: 'reload' });
    
    // 接收来自 worker 的消息
    worker.on('message', (msg) => {
        if (msg.type === 'status') {
            console.log(`Worker ${worker.id} status:`, msg.data);
        }
    });
    
    // 广播到所有 workers
    for (const id in cluster.workers) {
        cluster.workers[id].send({ type: 'broadcast', data: 'config_update' });
    }
    
} else {
    // Worker - 接收消息
    process.on('message', (msg) => {
        if (msg.type === 'command') {
            if (msg.action === 'reload') {
                // 重新加载配置而不重启 worker
                reloadConfig();
            }
        }
    });
    
    // 向主进程发送消息
    process.send({ type: 'status', data: { pid: process.pid, uptime: process.uptime() } });
}
```

## 进程生命周期管理架构

### Worker 状态和转换

```
┌─────────────────────────────────────────────────────────────────┐
│              Worker 生命周期状态                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    fork()    ┌──────────┐   online   ┌─────────┐│
│   │  NULL    │ ───────────▶ │  IPC     │ ─────────▶ │ ONLINE  ││
│   └──────────┘              └──────────┘            └─────────┘│
│                                                          │      │
│                                                          │      │
│                             listening ◀──────────────────┘      │
│                                   │                            │
│                                   │                            │
│                           ┌───────┴───────┐                    │
│                           │               │                    │
│                    disconnect()      exit code                  │
│                           │               │                    │
│                           ▼               ▼                    │
│                      ┌──────────┐   ┌──────────┐              │
│                      │DISCONNECTED│  │  EXITED   │              │
│                      └──────────┘   └──────────┘              │
│                                                                 │
│   触发的事件：                                                   │
│   ├── 'fork' - worker 被创建                                    │
│   ├── 'online' - worker 开始执行                                │
│   ├── 'listening' - worker 调用 listen()                       │
│   ├── 'disconnect' - IPC 通道关闭                              │
│   └── 'exit' - worker 进程终止                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Worker 事件和处理

```javascript
if (cluster.isPrimary) {
    cluster.on('fork', (worker) => {
        console.log(`Forking worker ${worker.id}`);
    });
    
    cluster.on('online', (worker) => {
        console.log(`Worker ${worker.id} is online and running`);
    });
    
    cluster.on('listening', (worker, address) => {
        console.log(`Worker ${worker.id} listening on ${address.address}:${address.port}`);
    });
    
    cluster.on('disconnect', (worker) => {
        console.log(`Worker ${worker.id} disconnected`);
    });
    
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.id} exited with code ${code}, signal ${signal}`);
        
        // 架构：exitedAfterDisconnect 表示故意 kill
        if (worker.exitedAfterDisconnect) {
            console.log('Worker was intentionally killed (disconnect)');
        } else {
            // 意外退出 - 重启以提高弹性
            console.log('Unexpected exit, restarting worker...');
            cluster.fork();
        }
    });
    
    cluster.on('error', (worker, error) => {
        console.error(`Worker ${worker.id} error:`, error);
    });
}
```

## 零停机部署架构

### 优雅关闭问题

```
┌─────────────────────────────────────────────────────────────────┐
│          零停机部署挑战                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   问题：如何在不丢弃连接的情况下重启 workers？                    │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │   1. 旧 worker 收到关闭信号                              │   │
│   │   2. 停止接受新连接                                      │   │
│   │   3. 完成处理现有连接                                    │   │
│   │   4. 仅在所有连接关闭后退出                               │   │
│   │   5. 新 worker 接管                                      │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   零停机架构：                                                    │
│   ├── SIGTERM → 优雅关闭                                        │
│   ├── server.close() 停止新连接                                │
│   ├── 跟踪活动连接，等待排空                                     │
│   ├── 超时后强制退出（fail-safe）                               │
│   └── 旧 worker 退出前生成新 workers                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 优雅关闭实现

```javascript
const cluster = require('cluster');
const http = require('http');

let isShuttingDown = false;

if (cluster.isPrimary) {
    const numCPUs = require('os').cpus().length;
    
    function spawnWorker() {
        const worker = cluster.fork();
        console.log(`Spawned worker ${worker.id}`);
        return worker;
    }
    
    // 初始 workers
    for (let i = 0; i < numCPUs; i++) {
        spawnWorker();
    }
    
    // 处理关闭信号
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    // 处理 worker 退出 - 除非正在关闭否则重新生成
    cluster.on('exit', (worker) => {
        if (!isShuttingDown) {
            console.log(`Worker ${worker.id} died, respawning...`);
            spawnWorker();
        }
    });
    
    function gracefulShutdown() {
        console.log('Received shutdown signal');
        isShuttingDown = true;
        
        // 停止向 workers 接受新连接
        cluster.disconnect(() => {
            console.log('All workers disconnected');
            process.exit(0);
        });
    }
    
} else {
    const server = http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200);
            res.end('OK');
            return;
        }
        
        // 模拟请求处理
        res.writeHead(200);
        res.end(`Handled by ${process.pid}`);
    });
    
    server.listen(3000);
    
    // 在 worker 中处理关闭信号
    process.on('SIGTERM', () => {
        console.log(`Worker ${process.pid} shutting down gracefully`);
        
        // 停止接受新连接
        server.close(() => {
            console.log(`Worker ${process.pid} closed all connections`);
            process.exit(0);
        });
        
        // 30 秒后强制退出（fail-safe）
        setTimeout(() => {
            console.error(`Worker ${process.pid} force exit (timeout)`);
            process.exit(1);
        }, 30000);
    });
}
```

## 高级模式

### 粘性会话架构

```
┌─────────────────────────────────────────────────────────────────┐
│              粘性会话设计                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   问题：需要同一客户端 → 同一 worker 来处理会话状态              │
│                                                                 │
│   解决方案：将客户端 IP 哈希到特定 worker                         │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │   客户端 IP: 192.168.1.100                              │   │
│   │                                                          │   │
│   │   哈希: sum(八位组) % worker 数量                        │   │
│   │   192 + 168 + 1 + 100 = 461                            │   │
│   │   461 % 4 = 1  → Worker 1                               │   │
│   │                                                          │   │
│   │   同一 IP 始终 → 同一 worker                            │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   权衡：                                                         │
│   ├── 优点：不需要外部会话存储                                    │
│   ├── 优点：更快（无 Redis 查找）                               │
│   ├── 缺点：如果客户端使用模式不同，负载不均匀                    │
│   └── 缺点：worker 故障会丢失会话                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 粘性会话实现

```javascript
const cluster = require('cluster');
const http = require('http');
const net = require('net');

if (cluster.isPrimary) {
    const workers = {};
    const numCPUs = require('os').cpus().length;
    
    // 根据客户端 IP 分配 worker（简单一致性哈希）
    function getWorkerForClient(ip) {
        const hash = ip.split('.').reduce((acc, octet) => acc + parseInt(octet), 0);
        const index = hash % numCPUs;
        const workerIds = Object.keys(cluster.workers);
        return cluster.workers[workerIds[index]];
    }
    
    // 启动所有 workers
    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster.fork();
        workers[worker.id] = { ip: null, connections: 0 };
    }
    
    // 主进程处理连接分发（无 SO_REUSEPORT）
    const server = net.createServer((socket) => {
        const clientIP = socket.remoteAddress;
        const worker = getWorkerForClient(clientIP);
        
        // 通过 IPC 将 socket 转发到特定 worker
        worker.send('sticky-session', socket);
    });
    
    server.listen(8000);
    
} else {
    const server = http.createServer((req, res) => {
        res.end(`Worker ${process.pid}\n`);
    });
    
    // 监听随机端口（worker 将通过 IPC 接收连接）
    server.listen(0);  // 端口 0 = 随机可用端口
    
    process.on('message', (msg, socket) => {
        if (msg === 'sticky-session' && socket) {
            // 处理转发的连接
            server._handleConnection(socket);
        }
    });
}
```

### 专用 Worker 类型架构

```
┌─────────────────────────────────────────────────────────────────┐
│              专用 Worker 类型                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   架构：不同工作负载使用不同 worker 类型                          │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  HTTP Workers（CPU 密集型，低延迟）                       │   │
│   │  └── 处理 API 请求，渲染页面                             │   │
│   └─────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  后台 Workers（I/O 密集型，高吞吐量）                      │   │
│   │  └── 处理队列、批处理任务、数据处理                        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Worker 类型通过环境变量配置                              │   │
│   │  cluster.fork({ WORKER_TYPE: 'http' })                 │   │
│   │  cluster.fork({ WORKER_TYPE: 'background' })           │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   好处：                                                         │
│   ├── 独立扩展每个类型                                          │
│   ├── 每个类型不同的资源分配                                      │
│   └── 隔离的故障域                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 专用 Worker 类型实现

```javascript
const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;

if (cluster.isPrimary) {
    // HTTP workers - 随 CPU 核心数扩展
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({ WORKER_TYPE: 'http' });
    }
    
    // 后台 workers - 固定数量（I/O 密集型，不是 CPU 密集型）
    for (let i = 0; i < 2; i++) {
        cluster.fork({ WORKER_TYPE: 'background' });
    }
    
} else {
    const workerType = process.env.WORKER_TYPE;
    
    if (workerType === 'http') {
        http.createServer((req, res) => {
            res.end('HTTP response');
        }).listen(3000);
    } else if (workerType === 'background') {
        // 后台任务处理器
        process.on('message', (msg) => {
            if (msg.type === 'job') {
                processJob(msg.data);
            }
        });
        
        // 通知主进程我们已就绪
        process.send({ type: 'ready', pid: process.pid });
    }
}
```

## 原生集群的技术替代方案

```
┌─────────────────────────────────────────────────────────────────┐
│          Node.js 集群模块的替代方案                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. PM2 / StrongLoop PM                                       │
│      ├── 带内置集群的进程管理器                                  │
│      ├── 自动重启、日志管理                                      │
│      ├── 优点：生产级功能                                        │
│      └── 缺点：外部依赖，非原生                                  │
│                                                                 │
│   2. Docker / Kubernetes                                       │
│      ├── 容器编排                                               │
│      ├── 水平 Pod 扩展                                          │
│      ├── 优点：平台无关，云原生                                  │
│      └── 缺点：单个容器 = 单个进程                               │
│                                                                 │
│   3. nginx / HAProxy 负载均衡器                                │
│      ├── 反向代理 + 负载均衡                                    │
│      ├── 健康检查、优雅升级                                      │
│      ├── 优点：专为负载均衡优化                                  │
│      └── 缺点：额外的基础设施组件                                │
│                                                                 │
│   4. DOCKER_MULTI_STAGE、无服务器函数                          │
│      ├── AWS Lambda、Google Cloud Functions                    │
│      ├── 优点：自动扩展到零                                      │
│      └── 缺点：无状态要求，冷启动                                 │
│                                                                 │
│   何时使用原生集群 vs 替代方案：                                 │
│   ├── 简单应用：原生集群足够                                     │
│   ├── 带监控的生产环境：PM2 增加功能                            │
│   ├── 云原生：Kubernetes 处理扩展                               │
│   └── 微服务：服务网格可能处理负载均衡                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 监控架构

### Worker 健康监控

```javascript
const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
    // 每 10 秒监控 workers
    setInterval(() => {
        const workers = Object.values(cluster.workers);
        
        console.log(`\n=== Cluster Status (${new Date().toISOString()}) ===`);
        console.log(`CPU cores: ${os.cpus().length}`);
        console.log(`Online workers: ${workers.length}`);
        
        workers.forEach(worker => {
            const memUsage = worker.process.memoryUsage();
            const cpuUsage = worker.process.cpuUsage();
            
            console.log(`  Worker ${worker.id}:`);
            console.log(`    PID: ${worker.process.pid}`);
            console.log(`    Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
            console.log(`    Uptime: ${Math.round(worker.uptime())}s`);
            console.log(`    State: ${worker.isDead() ? 'DEAD' : 'ALIVE'}`);
        });
    }, 10000);
}
```

## 常见架构陷阱

### 陷阱 1：没有 IPC 的共享状态

```javascript
// 错误：假设 workers 共享内存
if (cluster.isPrimary) {
    global.cache = {};  // 主进程缓存
} else {
    // 每个 worker 有自己的全局缓存！
    // 这个缓存不共享！
}

// 正确：使用外部存储共享状态
const redis = require('redis');
const client = redis.createClient();
client.get('key', (err, data) => { /* ... */ });
```

### 陷阱 2：不处理 Worker 死亡

```javascript
// 错误：没有重新生成策略
if (cluster.isPrimary) {
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    // Workers 死了但永远不会回来！
}

// 正确：始终重新生成 workers
cluster.on('exit', (worker) => {
    console.log(`Worker died, respawning`);
    cluster.fork();
});
```

### 陷阱 3：端口绑定冲突

```javascript
// 错误：每个 worker 尝试绑定相同端口而没有协调
// Workers 将无法绑定

// 正确：让集群模块处理端口共享
if (cluster.isPrimary) {
    cluster.fork();
} else {
    server.listen(8000);  // 集群处理协调
}
```

## 架构决策总结

```
┌─────────────────────────────────────────────────────────────────┐
│         集群模块架构决策                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   决策 1：基于进程（而不是基于线程）                              │
│   ├── 优点：内存隔离、崩溃恢复能力                               │
│   ├── 优点：简单的思维模型（无共享内存）                         │
│   └── 缺点：IPC 开销、较高的内存使用                             │
│                                                                 │
│   决策 2：轮询作为默认                                           │
│   ├── 优点：简单，不需要状态跟踪                                  │
│   ├── 优点：OS 级支持（SO_REUSEPORT）                           │
│   └── 缺点：不考虑不同的请求复杂性                               │
│                                                                 │
│   决策 3：通过 libuv 的 IPC                                      │
│   ├── 优点：跨平台、一致的 API                                   │
│   ├── 优点：支持文件描述符传递                                   │
│   └── 缺点：大消息的序列化开销                                   │
│                                                                 │
│   决策 4：自动端口共享                                           │
│   ├── 优点：简单的 API（server.listen(port)）                  │
│   ├── 优点：不需要显式协调                                        │
│   └── 缺点：神奇行为可能令人困惑                                 │
│                                                                 │
│   决策 5：基于事件的生命周期                                      │
│   ├── 优点：清晰的状态转换                                       │
│   ├── 优点：易于监控和调试                                       │
│   └── 缺点：必须处理所有事件以避免僵尸 workers                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 关键要点

1. **Node.js 从设计上来说是单线程的**：事件循环 + 非阻塞 I/O 使得高并发无需线程
2. **集群模块支持水平扩展**：多个进程，每个都有自己的事件循环
3. **选择基于进程而非基于线程**：更好的隔离、更简单的调试、无共享内存问题
4. **IPC 对于协调至关重要**：主进程和 workers 通过消息传递通信
5. **负载均衡因操作系统而异**：Linux 使用 SO_REUSEPORT，Windows 通过主进程使用轮询
6. **优雅关闭需要协调**：信号处理 + 连接排空 + 超时
7. **Workers 完全隔离**：无共享内存，使用 Redis/外部存储共享状态
8. **存在技术替代方案**：PM2、Kubernetes、nginx——根据运维复杂性选择

## 参考资料

- [Node.js 集群模块](https://nodejs.org/api/cluster.html)
- [Node.js 负载均衡内部原理](https://nodejs.org/api/cluster.html#cluster_how_it_works)
- [SO_REUSEPORT 负载均衡](https://www.nginx.com/blog/socket-sharding-nginx/)
- [优雅关闭模式](https://github.com/goldbergyoni/nodebestpractices)
- [libuv IPC 文档](http://docs.libuv.org/en/latest/ipc.html)
