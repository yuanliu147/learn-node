# SSE Streaming (Server-Sent Events)

## 架构视角

Server-Sent Events（服务器发送事件）是基于 HTTP 语义构建的**服务器推送模式**。理解 SSE 需要审视它为什么与 WebSocket 同时存在，以及何时选择它们。

**设计哲学**：SSE 选择拥抱 HTTP 作为基础，而不是与之对抗。这带来了：
- 自动兼容代理/反向代理服务器
- 享受 HTTP/2 多路复用优势
-  stateless 服务端模型的高效性

对于 LLM 流式响应，SSE 已成为**事实标准**，因为 LLM 推理本质上是单向的（输入 prompt，输出 tokens）—— WebSocket 的双向能力反而是不必要的复杂性。

## 为什么 LLM 流式传输选 SSE？

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM 响应模式                              │
├─────────────────────────────────────────────────────────────┤
│  Prompt → LLM → Token → Token → Token → ... → Done         │
│                     (单向传输)                               │
└─────────────────────────────────────────────────────────────┘
```

**核心洞察**：LLM 响应不需要客户端在生成过程中向服务端推送数据。客户端发送完整的 prompt；服务端流式返回 tokens。这完美契合 SSE 的单向模型。

## 架构

```
Client                    Server
  │                         │
  │──── GET /stream ────────>│
  │    (HTTP/1.1 or /2)     │
  │                         │
  │<─── event: token ────────│  (流式传输 tokens)
  │<─── event: token ────────│
  │<─── event: token ────────│
  │                         │
  │<─── event: done ─────────│  (完成信号)
  │                         │
  │    (连接复用或关闭)
```

**连接生命周期**：
1. 客户端 POST 请求打开连接（发送 prompt）
2. 服务端流式返回 tokens 直到完成
3. 连接关闭或在 HTTP/2 下保持开放（用于下次请求）

## SSE 协议格式

```javascript
event: token
data: {"content": "Hello"}

event: token
data: {"content": " World"}

event: done
data: {"usage": {"total_tokens": 50}}
```

**协议语义**：
- `event:` - 事件类型标识符（客户端可专门监听）
- `data:` - 负载（UTF-8 文本，本例中是 JSON）
- `\n\n` - **必须的双换行符**用于终止每个事件
- `:` - 注释行（`: heartbeat\n\n`）用于保活

## Node.js 实现

```javascript
// SSE 流式服务器
const http = require('http');

function createSSEStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'  // 禁用 nginx 缓冲
  });

  return {
    sendToken(token) {
      res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
    },
    sendDone(usage) {
      res.write(`event: done\ndata: ${JSON.stringify({ usage })}\n\n`);
      res.end();
    },
    sendError(message) {
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  };
}

// 与 LLM 流式集成
server.on('request', async (req, res) => {
  if (req.url === '/stream' && req.method === 'POST') {
    const stream = createSSEStream(res);
    const { prompt } = JSON.parse(await getBody(req));
    
    try {
      for await (const chunk of llm.stream(prompt)) {
        stream.sendToken(chunk.content);
      }
      stream.sendDone(llm.getUsage());
    } catch (error) {
      stream.sendError(error.message);
    }
  }
});
```

**架构决策**：
1. **事件类型化**（`token`, `done`, `error`）- 支持客户端路由不同类型事件
2. **JSON 负载** - 人类可读，便于调试，易于解析
3. **手动 `res.end()`** - 服务端控制连接生命周期
4. **`X-Accel-Buffering: no`** - 部署在 nginx 后的关键配置

## 客户端使用

```javascript
// 浏览器 EventSource（原生支持 SSE）
const eventSource = new EventSource('/stream', {
  method: 'POST',
  body: JSON.stringify({ prompt: 'Write a story' })
});

eventSource.addEventListener('token', (e) => {
  const { token } = JSON.parse(e.data);
  appendToOutput(token);
});

eventSource.addEventListener('done', (e) => {
  const { usage } = JSON.parse(e.data);
  showUsage(usage);
  eventSource.close();
});

eventSource.addEventListener('error', (e) => {
  console.error('Stream error:', e);
  eventSource.close();
});
```

**EventSource 局限性**：
- 只支持 GET 请求（变通方案：URL 中的 tokens 或独立认证端点）
- 不支持自定义请求头（认证 token 必须基于 cookie）
- 不支持请求体（SSE 建立连接后只能接收）

## SSE vs WebSocket vs 长轮询

| 特性 | SSE | WebSocket | 长轮询 |
|------|-----|-----------|--------|
| **方向** | 服务端 → 客户端 | 双向 | 请求-响应 |
| **协议** | HTTP/1.1+ | ws:// 或 wss:// | HTTP |
| **浏览器支持** | 原生 EventSource | 需手动实现 | 需要 polyfill |
| **重连** | 自动 | 手动 | 自动 |
| **代理支持** | ✅ 支持 | ❌ 不支持（除非 wss://） | ✅ 支持 |
| **二进制数据** | 仅 Base64 | 原生支持 | ✅ 支持 |
| **HTTP/2** | 多路复用 | HTTP/2 多路复用 | 有限 |
| **复杂度** | 低 | 中 | 高 |
| **典型场景** | LLM 流式输出、消息 feeds | 实时游戏、聊天 | 仅作为降级方案 |

**决策矩阵**：
```
需要双向通信？     → WebSocket
仅浏览器客户端？   → SSE（更简单）或 WebSocket
企业代理环境？     → SSE
LLM 流式输出？     → SSE（标准选择）
高频交易？         → WebSocket（更低延迟）
```

## 性能特征

### 带宽效率
```javascript
// SSE 每个消息的 token 开销
"event: token\ndata: \n\n"  // 每个 token 约 17 字节开销

// 1000 tokens 的情况：
// 17 * 1000 = 17KB 开销
// 对比 WebSocket 帧开销：约 2-6 字节
```

**洞察**：SSE 的每条消息开销高于 WebSocket，但对于文本流式传输（token 负载占主导）影响可忽略。

### 延迟
```
SSE: 客户端 → 服务端：约 50-100ms（首 token 延迟，POST 处理）
     服务端 → 客户端：约 5-20ms/token（取决于网络）

WebSocket: 连接建立：约 100-200ms（全双工）
           每条消息：约 2-5ms（无 HTTP 头）
```

**权衡**：WebSocket 稳态延迟更低，但连接建立开销更高。对于 LLM 流式输出，首 token 延迟是用户体验的关键，SSE 基于 POST 的方式是可以接受的。

## 最佳实践

### 1. 处理连接断开
```javascript
// 客户端：指数退避自动重连
const eventSource = new EventSource('/stream');
let reconnectDelay = 1000;

eventSource.onerror = () => {
  setTimeout(() => {
    eventSource.close();
    eventSource = new EventSource('/stream'); // 重连
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
};
```

**原因**：移动网络断连常见。SSE 自动重连 + 自定义退避防止雷鸣群效应，同时提供韧性。

### 2. 心跳保活
```javascript
// 服务端：每 30s 发送注释行
// 防止代理关闭"空闲"连接
setInterval(() => {
  res.write(': heartbeat\n\n');
}, 30000);
```

**代理行为**：代理通常在 30-60s 后关闭"空闲"连接。心跳注释保持连接活跃，同时不改变语义。

### 3. 缓冲刷新
```javascript
res.flush?.();  // Node.js response.flush()
// 确保 tokens 立即到达客户端
```

**问题**：Node 会对小写入进行缓冲。实时流式传输需要显式刷新以确保即时传递。

### 4. 优雅降级
```javascript
// 对于不支持 SSE 的环境回退到轮询
async function stream(prompt) {
  if (typeof EventSource !== 'undefined') {
    // 使用 SSE
  } else {
    // 轮询降级方案
    const response = await fetch('/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
    return response.json();
  }
}
```

## 常见误区

| 误区 | 原因 | 解决方案 |
|------|------|----------|
| **Nginx 缓冲** | nginx 默认行为 | 添加 `X-Accel-Buffering: no` 响应头 |
| **CDN 缓存** | 缓存响应头 | `Cache-Control: no-cache` |
| **浏览器标签页节流** | 后台标签页限制 | Chrome 会批量事件 |
| **内存泄漏** | 未清理的监听器 | 所有路径都要调用 `eventSource.close()` |
| **缺少 `\n\n`** | 协议错误 | 双换行符终止事件 |
| **防火墙关闭** | 空闲超时 | 心跳注释 |

## 扩展性考虑

### 水平扩展
```
                    ┌─────────────┐
                    │ 负载均衡器   │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐     ┌─────────┐     ┌─────────┐
      │ Node 1  │     │ Node 2  │     │ Node 3  │
      │ (SSE)   │     │ (SSE)   │     │ (SSE)   │
      └─────────┘     └─────────┘     └─────────┘
```

**挑战**：SSE 连接是长连接（持续数分钟）。负载均衡器可能关闭空闲连接或路由不一致。

**解决方案**：
1. **粘性会话**：路由同一客户端到同一节点
2. **Redis pub/sub**：所有节点发布到 Redis；订阅者接收事件
3. **WebSocket 升级**：如果需要双向，WebSocket 可能更简单

### 连接限制
| 服务器 | 最大连接数 | 备注 |
|--------|-----------|------|
| Node.js（默认） | 每进程约 10,000 | 受文件描述符限制 |
| nginx | 每 worker 约 20,000 | 可以调高 |
| HTTP/2 | 多路复用（单连接） | 减少连接数 |

## 总结

SSE 提供了**最简单、最易部署**的 LLM 流式响应机制。其 HTTP 原生设计意味着：
- 可穿透任何代理或防火墙
- HTTP/2 提供效率提升
- 客户端 `EventSource` 可直接用于生产
- 协议易于人类调试

**何时选择替代方案**：
- 需要双向通信 → WebSocket
- 需要传输二进制数据 → WebSocket
- 需要兼容老旧浏览器 → 长轮询降级
- 极致低延迟 → WebSocket（但对 LLM 场景可能没必要）

LLM 生态选择 SSE 是因为问题域（单向流式文本）恰好是 SSE 的设计目标。
