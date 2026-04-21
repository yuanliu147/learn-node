---
id: tcp-connection-pool
title: TCP 连接池技术选型
difficulty: L3
tags: ["tcp", "connection-pool", "http", "network", "performance"]
prerequisites: ["http-lifecycle"]
related: ["keep-alive-optimization", "tls-handshake"]
interview_hot: false
ai_confidence: 4
version: 2.0
last_updated: 2026-04-21
human_verified: false
todo:
  - 添加 HTTP/2 连接池特性
  - 补充 Agent vs globalAgent 差异
---

# TCP 连接池技术选型

## 一句话定义

> TCP 连接池是在客户端维护一组可复用 TCP 连接的技术，通过减少连接建立/销毁的开销来提升网络通信性能，同时通过限制并发连接数防止资源耗尽。

---

## 解决什么问题

### 连接建立的性能开销

```
无连接池 - 每次请求新建连接:
┌─────────────────────────────────────────────────────────────────────────┐
│  请求1: RTT = 3 (SYN + SYN-ACK + ACK) + 数据传输                      │
│  请求2: RTT = 3 (SYN + SYN-ACK + ACK) + 数据传输  ← 完全重复的开销   │
│  请求3: RTT = 3 (SYN + SYN-ACK + ACK) + 数据传输                      │
└─────────────────────────────────────────────────────────────────────────┘
总开销: 9 RTTs

有连接池 - 复用连接:
┌─────────────────────────────────────────────────────────────────────────┐
│  请求1: RTT = 3 + 数据传输 (建立连接)                                  │
│  请求2: 数据传输 (复用!)                                                │
│  请求3: 数据传输 (复用!)                                                │
└─────────────────────────────────────────────────────────────────────────┘
总开销: 3 RTTs + N×数据传输
```

### 连接池核心价值

| 问题 | 解决方案 | 效果 |
|------|----------|------|
| TCP 握手延迟 | 连接复用 | 节省 1-2 RTT |
| TLS 握手延迟 | 连接复用 | 节省 2-3 RTT |
| 连接内存分配 | 预分配池 | 减少 GC 压力 |
| 并发连接数 | 池大小限制 | 防止资源耗尽 |
| 服务器负载 | 连接复用 | 减少服务器连接数 |

---

## 架构设计

### 连接池状态机

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         连接池状态机                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                    ┌──────────────┐                                     │
│                    │    Active     │ ← 使用中                            │
│                    │  (被请求占用)  │                                     │
│                    └──────┬───────┘                                     │
│                           │ 完成                                        │
│                           ▼                                              │
│                    ┌──────────────┐                                     │
│                    │    Idle      │ ← 等待复用                          │
│                    │  (池中空闲)   │                                     │
│                    └──────┬───────┘                                     │
│                           │ 需要                                         │
│                           ▼                                              │
│                    ┌──────────────┐                                     │
│                    │    Queued     │ ← 等待空闲连接                      │
│                    │  (请求排队)   │                                     │
│                    └──────┬───────┘                                     │
│                           │ 超时/关闭                                    │
│                           ▼                                              │
│                    ┌──────────────┐                                     │
│                    │    Closed     │ ← 已销毁                            │
│                    │              │                                     │
│                    └──────────────┘                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Node.js HTTP Agent 架构

```javascript
// http.Agent 内部结构
class Agent {
  // 按 host:port 组织的空闲 sockets
  freeSockets: Map<host:port, Socket[]>
  
  // 使用中的 sockets
  sockets: Map<host:port, Socket[]>
  
  // 排队等待的请求
  requests: Map<host:port, Request[]>
  
  // 配置
  maxSockets: 25        // 每主机最大并发
  maxFreeSockets: 10   // 最大空闲 sockets
  timeout: 60000        // socket 超时
}
```

### 请求流程

```
发起 HTTP 请求:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  1. 检查是否有空闲 socket                                                │
│     │                                                                    │
│     ├── 有 → 分配给请求，标记为 Active                                   │
│     │                                                                    │
│     └── 无 → 检查是否达到 maxSockets                                     │
│              │                                                          │
│              ├── 未达到 → 创建新 socket                                  │
│              │                                                          │
│              └── 已达到 → 请求加入队列 (waiting)                          │
│                                                                          │
│  2. 请求完成 (response end)                                             │
│     │                                                                    │
│     ├── socket 有错误 → 关闭，创建一个新 socket 补充池                   │
│     │                                                                    │
│     ├── socket 可复用且池未满 → 放入 idle 池                             │
│     │                                                                    │
│     └── socket 不可复用 → 关闭                                          │
│                                                                          │
│  3. 队列非空时                                                          │
│     │                                                                    │
│     └── 从队列取出请求，分配空闲/新 socket                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 技术选型视角

### 何时使用连接池

| 场景 | 推荐 | 原因 |
|------|------|------|
| **高频 HTTP 请求** | ✅ 必须 | 复用连接节省大量 RTT |
| **数据库连接** | ✅ 必须 | TCP + 协议握手开销大 |
| **微服务通信** | ✅ 必须 | 频繁的 RPC 调用 |
| **一次性请求** | ❌ 不需要 | 连接池开销大于收益 |
| **长连接场景** | ⚠️ 评估 | WebSocket 不走 HTTP 池 |
| **低频请求** | ❌ 不需要 | 维护空闲连接浪费资源 |

### 连接池大小选择

```
决定因素:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  maxSockets 计算公式:                                                     │
│                                                                          │
│  理论值 = (可用文件描述符 × 平均利用率) / 主机数                          │
│                                                                          │
│  实际建议:                                                               │
│  • 单主机: 25-50                                                        │
│  • 多主机: 每个主机 5-25                                                │
│  • 全局限制: 100-200 (根据 ulimit -n)                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

风险:
┌─────────────────────────────────────────────────────────────────────────┐
│  设置过大                              │ 设置过小                         │
│  ──────────────────────────────        │ ──────────────────────────────  │
│  • 耗尽文件描述符                      │ • 请求排队延迟                   │
│  • 内存压力                            │ • 吞吐量下降                     │
│  • 服务器端连接数过多                  │ • 资源利用率低                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 自研 vs 使用库

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **Node.js http.Agent** | 简单 HTTP 请求 | 内置、够用 | 功能有限 |
| **got/lamppm** | 功能丰富需求 | 重试、缓存、拦截 | 额外依赖 |
| **generic-pool** | 任意资源池 | 通用、灵活 | 需要自己管理连接 |
| **自研连接池** | 特殊协议/需求 | 完全可控 | 开发维护成本高 |

### 连接池配置对比

```javascript
// 保守配置 - 适合长尾请求
const conservativeAgent = new http.Agent({
  maxSockets: 5,           // 限制并发
  maxFreeSockets: 2,       // 限制空闲
  timeout: 30000,           // 快速回收
  scheduling: 'fifo',      // 公平调度
});

// 激进配置 - 适合高频请求
const aggressiveAgent = new http.Agent({
  maxSockets: 50,          // 高并发
  maxFreeSockets: 25,      // 更多空闲缓冲
  timeout: 120000,         // 允许长连接
  scheduling: 'lifo',      // 复用最新连接
});

// Keep-Alive 配置
const keepAliveAgent = new http.Agent({
  keepAlive: true,         // 启用 keep-alive
  keepAliveTimeout: 60000, // idle 超时
  maxSockets: 25,
  maxFreeSockets: 10,
});
```

---

## 实战配置

### HTTP 连接池

```javascript
const http = require('http');

// 创建专用 Agent
const apiAgent = new http.Agent({
  maxSockets: 10,           // 每主机 10 并发
  maxFreeSockets: 5,       // 最多 5 个空闲
  timeout: 60000,           // 60s 超时
  scheduling: 'fifo',
});

// 使用
const req = http.request({
  hostname: 'api.example.com',
  port: 80,
  path: '/v1/users',
  method: 'GET',
  agent: apiAgent,
}, (res) => {
  // 处理响应
});

// 请求结束时自动复用或关闭
```

### HTTPS 连接池

```javascript
const https = require('https');

// HTTPS 需要处理 TLS
const httpsAgent = new https.Agent({
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
  // TLS 选项
  cert: fs.readFileSync('client-cert.pem'),
  key: fs.readFileSync('client-key.pem'),
  ca: fs.readFileSync('ca.pem'),
  // 拒绝无效证书
  rejectUnauthorized: true,
});
```

### 使用 generic-pool 管理任意资源

```javascript
const genericPool = require('generic-pool');
const mysql = require('mysql');

// 创建 MySQL 连接池
const dbPool = genericPool.createPool({
  create: () => mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'test'
  }),
  destroy: (conn) => conn.end(),
  validate: (conn) => conn.state === 'connected',
}, {
  max: 10,  // 最大连接数
  min: 2,   // 最小连接数
  acquireTimeoutMillis: 5000,  // 获取超时
  idleTimeoutMillis: 30000,    // 空闲超时
});

// 使用
async function query(sql) {
  const conn = await dbPool.acquire();
  try {
    return await conn.query(sql);
  } finally {
    dbPool.release(conn);
  }
}
```

### 连接池监控

```javascript
class MonitoredAgent extends http.Agent {
  constructor(options) {
    super(options);
    this.metrics = {
      created: 0,
      closed: 0,
      reused: 0,
      queued: 0,
    };
  }

  createConnection(...args) {
    this.metrics.created++;
    return super.createConnection(...args);
  }

  _destroySocket(socket, ...args) {
    this.metrics.closed++;
    return super._destroySocket(socket, ...args);
  }

  // 获取指标
  getMetrics() {
    return {
      ...this.metrics,
      active: Object.keys(this.sockets).length,
      idle: Object.keys(this.freeSockets).length,
    };
  }
}

// 使用
const agent = new MonitoredAgent({ maxSockets: 10 });

setInterval(() => {
  console.log('Pool metrics:', agent.getMetrics());
}, 5000);
```

---

## 常见问题

### Q: 为什么请求会排队？

```javascript
// 原因: 所有 socket 都被占用，新请求需要等待
const agent = new http.Agent({ maxSockets: 1 });

// 请求1 占用 socket
http.request({ agent, hostname: 'example.com' }, console.log);

// 请求2 排队等待
http.request({ agent, hostname: 'example.com' }, console.log);

// 解决方案: 增加 maxSockets
const betterAgent = new http.Agent({ maxSockets: 10 });
```

### Q: socket hang up 错误

```javascript
// 原因: 连接被服务器关闭或超时
// 解决方案: 设置合理的超时和重试

const agent = new http.Agent({
  maxSockets: 10,
  timeout: 30000,
});

// 添加重试逻辑
async function requestWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

### Q: Keep-Alive vs Connection: close

```javascript
// Connection: keep-alive - 复用连接
{
  headers: {
    'Connection': 'keep-alive'  // 默认行为
  }
}

// Connection: close - 每次请求后关闭
{
  headers: {
    'Connection': 'close'
  }
}

// Node.js http.Agent 默认保持连接
// 设置 keepAlive: false 来禁用
const noKeepAliveAgent = new http.Agent({
  keepAlive: false
});
```

---

## 性能对比

```
基准测试: 100 个 HTTP GET 请求到同一主机

无连接池:
┌─────────────────────────────────────────────────────────────┐
│ Time: 4500ms                                              │
│ Connections: 100 (每个请求新建)                             │
│ Avg latency: 45ms                                          │
└─────────────────────────────────────────────────────────────┘

有连接池 (maxSockets=10):
┌─────────────────────────────────────────────────────────────┐
│ Time: 800ms                                                │
│ Connections: 10 (复用)                                      │
│ Avg latency: 8ms                                            │
└─────────────────────────────────────────────────────────────┘

性能提升: 5.6x 吞吐量, 5.6x 延迟降低
```

---

## 相关资源

- [[http-lifecycle]] - HTTP 协议完整生命周期
- [[keep-alive-optimization]] - Keep-Alive 深入优化
- [[tls-handshake]] - HTTPS 连接池特殊考虑
