# HTTP 生命周期

> **架构视角**：Node.js 中的 HTTP 是一个**状态机，管理共享的有限资源：TCP 连接**。生命周期的每个阶段 — 连接建立、请求处理、keep-alive 复用 — 都涉及关于并发、内存和延迟的显式架构决策。

## HTTP 连接状态机

HTTP 位于 TCP 之上（可选 TLS）。生命周期是一系列状态转换，每个转换都消耗或释放资源。

```
TCP Connection Pool (shared, finite)
        │
        ▼
┌───────────────────┐
│   CONNECTING      │  Socket allocated, SYN in flight
└────────┬──────────┘
         │ SYN-ACK received
         ▼
┌───────────────────┐
│   TLS HANDSHAKE   │  (if HTTPS) Certificate validation, key exchange
└────────┬──────────┘
         │ Handshake complete
         ▼
┌───────────────────┐
│   IDLE            │  Connection open, awaiting request
│   (keep-alive)    │  Can be reused for multiple requests
└────────┬──────────┘
         │ Request received
         ▼
┌───────────────────┐
│   HEADERS RECEIVED│  Request line + headers parsed
│   mikeHeadersRecvd│  Routing decision made
└────────┬──────────┘
         │ First body chunk written
         ▼
┌───────────────────┐
│   WRITING         │  Request body streaming in
│   mikeWriting     │
└────────┬──────────┘
         │ Body complete
         ▼
┌───────────────────┐
│   HEADERS SENT    │  Response status + headers sent
│   mikeWriteComplete│
└────────┬──────────┘
         │ Response body streaming
         ▼
┌───────────────────┐
│   SENDING         │  Response body flowing to client
│   mikeSending     │
└────────┬──────────┘
         │ Response complete
         ▼
┌───────────────────┐
│   KEEP-ALIVE      │  Connection reused (if keep-alive)
│   mikeKeepAlive   │  OR
└───────────────────┘
         │
         ▼
┌───────────────────┐
│   CLOSED          │  FIN handshake or RST
│   mikeClosed      │  Socket released back to pool
└───────────────────┘
```

**关键架构洞察**：每个连接都经历这些状态转换。服务器的并发模型决定有多少连接可以同时处于 `WRITING`/`SENDING` 状态。Node.js 的事件循环并发处理所有状态 — 不需要每连接一个线程。

## 阶段 1：连接建立（TCP + TLS）

```
Client                               Server
   │                                    │
   │────────── TCP SYN ─────────────────▶│  Socket allocated
   │◀───────── SYN-ACK ─────────────────│  Connection queued
   │────────── ACK ────────────────────▶│
   │                                    │
   │────────── TLS ClientHello ────────▶│
   │◀───────── ServerHello ─────────────│
   │◀───────── Certificate ─────────────│
   │◀───────── KeyExchange ─────────────│
   │◀───────── ServerHelloDone ─────────│
   │────────── ClientKeyExchange ──────▶│
   │────────── ChangeCipherSpec ───────▶│
   │────────── Finished ──────────────▶│
   │◀───────── ChangeCipherSpec ───────│
   │◀───────── Finished ───────────────│
   │                                    │
   │══════════ HTTP Request ═══════════▶│
```

**架构决策**：
- **TCP_NODELAY**：禁用 Nagle 算法 — 以更多数据包为代价减少交互请求的延迟
- **TLS session reuse**：避免每次请求进行完整握手。`session` ticket 支持 0-RTT 恢复
- **连接池**：跨请求复用 TCP 连接（keep-alive）

## 阶段 2：请求解析

```javascript
const http = require('http');

const server = http.createServer((req, res) => {
  // req is a Readable stream
  // req.headers - parsed headers
  // req.method  - GET, POST, etc.
  // req.url     - path + query string
});
```

**解析管道**：
1. **请求行**：`GET /path?query=value HTTP/1.1` → method, url, http version
2. **Headers**：键值对，折行连接
3. **Body**：流式进入 `req` readable 缓冲区

**架构**：`http.IncomingMessage` 是一个 Readable 流。这意味着你可以 `pipe()`、`pipeline()`、应用背压 — 标准流语义。

## 阶段 3：响应写入

```javascript
res.writeHead(200, { 'Content-Type': 'application/json' });
res.write(JSON.stringify(data));
res.end();
```

**状态转换**：
```
res.writeHead()  →  headers sent, state → mikeWriteComplete
res.write()      →  body chunks sent, state → mikeSending
res.end()        →  response complete, state → mikeKeepAlive (if keep-alive)
```

**架构**：`res` 是一个 Writable 流。相同的背压契约适用 — 当 socket 缓冲区满时 `res.write()` 返回 `false`。

## 阶段 4：连接复用（Keep-Alive）

```
Connection Timeline:

Request 1 ──────────▶ Response 1 ──────────▶
                                    │
                         IDLE (keep-alive)
                                    │
Request 2 ─────────────────────────▶ Response 2 ──────────▶
                                                        │
                                                     CLOSED
```

**Keep-Alive 权衡**：

| 设置 | 好处 | 代价 |
|------|------|------|
| `keepAlive: true` | 消除重复请求的 TCP + TLS 握手开销 | 连接占用服务器内存 |
| `keepAliveTimeout` | 限制空闲连接生命周期 | 关闭可能复用的连接 |
| `maxSocketsPerHost` | 防止连接耗尽 | 限制对该主机的并行度 |

```javascript
const agent = new http.Agent({
  keepAlive: true,
  maxSocketsPerHost: 10,
  maxFreeSockets: 5,
  timeout: 60000,
});
```

**架构**：连接池跨请求共享。错误管理池大小导致连接饥饿（太少）或资源耗尽（太多）。

## Socket 作为托管资源

```javascript
const req = http.request(options, (res) => {
  res.on('data', (chunk) => { /* ... */ });
});

req.on('socket', (socket) => {
  // Socket is assigned — but not yet connected
  socket.on('connect', () => {
    // TCP + TLS complete
  });
});

req.on('response', (res) => {
  // Headers received (before body)
});

req.on('close', () => {
  // Connection fully closed — resource released
});
```

**Socket 生命周期事件**：
- `socket` — Socket 分配给请求
- `connect` — TCP 握手完成（+ TLS 如果适用）
- `response` — HTTP 响应头接收
- `data` — 接收 body 块
- `end` — Body 完全接收
- `close` — 底层连接关闭

## 架构：请求/响应作为流

```
Client                                          Server
   │                                               │
   │─────────── Outgoing Request (Writable) ──────▶│
   │  (backpressure applies if server is slow)     │
   │                                               │
   │◀────────── Incoming Response (Readable) ◀─────│
   │  (server backpressure applies if client slow) │
```

**关键架构模式**：Node.js 中的 HTTP 是**端到端的流导向**。请求 body 是来自客户端的 readable 流；响应 body 是到客户端的 readable 流。两者都支持背压。

```javascript
// Server: streaming a large file to client
// Backpressure propagates: client socket → res writable → fs readable
const { pipeline } = require('stream');
pipeline(
  fs.createReadStream(largeFile),
  createReadStream,
  res,
  (err) => { /* cleanup */ }
);

// Client: streaming request body from file
// Backpressure propagates: server ← req writable ← fs readable
const { pipeline } = require('stream');
pipeline(
  fs.createReadStream(uploadFile),
  req,  // Request is a writable
  (err) => { /* handle upload completion */ }
);
```

## Node.js HTTP 服务器状态机

```
                    ┌─────────────────────────────────────┐
                    │              mikeIdle                │
                    │    Waiting for connection            │
                    └──────────────┬──────────────────────┘
                                   │ connection
                                   ▼
                    ┌─────────────────────────────────────┐
                    │         mikeWriting                 │
                    │    Receiving request headers/body   │
                    └──────────────┬──────────────────────┘
                                   │ headers complete
                                   ▼
                    ┌─────────────────────────────────────┐
                    │       mikeHeadersRecvd               │
                    │    Request fully parsed             │
                    │    (emits 'request' event)          │
                    └──────────────┬──────────────────────┘
                                   │ user calls res.write*
                                   ▼
                    ┌─────────────────────────────────────┐
                    │         mikeSending                │
                    │    Sending response to client      │
                    └──────────────┬──────────────────────┘
                                   │ response complete
                                   ▼
                    ┌─────────────────────────────────────┐
                    │        mikeKeepAlive               │
                    │   Waiting for next request         │
                    │   (or timeout → mikeClosed)        │
                    └─────────────────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────┐
                    │          mikeClosed                │
                    │    Connection released             │
                    └─────────────────────────────────────┘
```

**架构洞察**：服务器每次只能处理每个连接的一个请求（HTTP/1.1）。`mikeWriting` 和 `mikeSending` 对每个 socket 是互斥的。并发来自多个连接，而非流水线（很少使用）。

## 常见状态码（架构含义）

| 代码 | 类别 | 架构含义 |
|------|------|---------|
| 200 | 2xx | 成功 — 响应 body 有效 |
| 201 | 2xx | 已创建 — 幂等 PUT 成功 |
| 204 | 2xx | 无内容 — 响应 body 故意为空 |
| 301/302 | 3xx | 重定向 — 客户端必须用新请求跟随 |
| 304 | 3xx | 未修改 — 使用缓存响应（无 body） |
| 400 | 4xx | 客户端错误 — 坏请求，不要用相同输入重试 |
| 401 | 4xx | 未授权 — 需要认证 |
| 403 | 4xx | 禁止 — 已认证但未授权 |
| 404 | 4xx | 未找到 — 资源不存在 |
| 429 | 4xx | 请求过多 — 客户端应该退让（背压！） |
| 500 | 5xx | 服务器错误 — bug，重试可能成功 |
| 502/503 | 5xx | 上游错误 — 代理/网关故障 |

**架构**：状态码传达谁对错误负责（客户端 vs 服务器）以及客户端下一步应该做什么（重试、重定向、退让）。

## HTTP/2 注意事项（升级路径）

HTTP/1.1 有一个基本并发限制：每个连接一个请求（队头阻塞）。HTTP/2 在单个连接上复用多个请求：

```
HTTP/1.1:  Connection 1 → Request A → Response A → Request B → Response B
                       (sequential, blocking)

HTTP/2:    Connection 1 → Request A ──────────────────────────▶ Response A
                       → Request B ───────▶ Response B
                       → Request C ──▶ Response C
                       (parallel, non-blocking)
```

**架构决策**：如果构建高并发服务，HTTP/2 消除了客户端对连接池的需求。Node.js 通过 `http2` 模块支持 HTTP/2。

## 相关架构模式

| 模式 | 相关节点 |
|------|---------|
| 连接池 | [[tcp-connection-pool]] |
| Keep-alive 调优 | [[keep-alive-optimization]] |
| TLS session 重用 | [[tls-handshake]] |
| HTTP/2 复用 | [[http2-upgrade]] |
| 请求背压 | [[backpressure-mechanism]] |
| 流管道组合 | [[pipeline-vs-pipe]] |
