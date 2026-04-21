# SSE Streaming (Server-Sent Events)

## Architectural Perspective

Server-Sent Events represent a **server-push pattern** built directly on HTTP semantics. Understanding SSE requires examining why it exists alongside WebSocket and when to choose each.

**Design Philosophy**: SSE embraces HTTP as a substrate rather than fighting it. This results in:
- Automatic proxy/proxy server compatibility
- HTTP/2 multiplexing benefits
- Stateless server model efficiency

For LLM streaming specifically, SSE has become the **de facto standard** because LLM inference is inherently unidirectional (prompt in, tokens out) - making WebSocket's bidirectional capability unused complexity.

## Why SSE for LLM Streaming?

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM Response Pattern                      │
├─────────────────────────────────────────────────────────────┤
│  Prompt → LLM → Token → Token → Token → ... → Done         │
│                     (one direction only)                     │
└─────────────────────────────────────────────────────────────┘
```

**Key Insight**: LLM responses don't require client → server streaming mid-generation. The client sends a complete prompt; the server streams back tokens. This is a perfect fit for SSE's unidirectional model.

## Architecture

```
Client                    Server
  │                         │
  │──── GET /stream ────────>│
  │    (HTTP/1.1 or /2)     │
  │                         │
  │<─── event: token ────────│  (streaming tokens)
  │<─── event: token ────────│
  │<─── event: token ────────│
  │                         │
  │<─── event: done ─────────│  (completion signal)
  │                         │
  │    (connection reused or closed)
```

**Connection Lifecycle**: 
1. Client opens connection with POST (sends prompt)
2. Server streams tokens until complete
3. Connection closes OR stays open for next request (HTTP/2)

## SSE Protocol Format

```javascript
event: token
data: {"content": "Hello"}

event: token
data: {"content": " World"}

event: done
data: {"usage": {"total_tokens": 50}}

```

**Protocol Semantics**:
- `event:` - Event type identifier (client can listen specifically)
- `data:` - Payload (UTF-8 text, JSON in our case)
- `\n\n` - **Required double newline** terminates each event
- `:` - Comment lines (`: heartbeat\n\n`) used for keep-alive

## Node.js Implementation

```javascript
// SSE Streaming Server
const http = require('http');

function createSSEStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'  // Disable nginx buffering
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

// Usage with LLM streaming
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

**Architecture Decisions**:
1. **Event typing** (`token`, `done`, `error`) - Enables client-side routing of different event types
2. **JSON payloads** - Human-readable debugging, easy parsing
3. **Manual `res.end()`** - Server controls connection lifecycle
4. **`X-Accel-Buffering: no`** - Critical for nginx deployments

## Client-Side Usage

```javascript
// Browser EventSource (native SSE support)
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

**EventSource Limitations**:
- Only supports GET requests (workaround: tokens in URL or separate auth endpoint)
- No custom headers (auth token must be cookie-based)
- No request body (SSE is receive-only after connection)

## SSE vs WebSocket vs Long-Polling

| Feature | SSE | WebSocket | Long-Polling |
|---------|-----|-----------|--------------|
| **Direction** | Server → Client | Bidirectional | Request-Response |
| **Protocol** | HTTP/1.1+ | ws:// or wss:// | HTTP |
| **Browser Support** | Native EventSource | Manual implementation | Polyfill needed |
| **Reconnection** | Automatic | Manual | Automatic |
| **Proxy Support** | ✅ Yes | ❌ No (unless wss://) | ✅ Yes |
| **Binary Data** | Base64 only | Native | ✅ Yes |
| **HTTP/2** | Multiplexing | HTTP/2 multiplexing | Limited |
| **Complexity** | Low | Medium | High |
| **典型 Use Case** | LLM streaming, feeds | Real-time games, chat | Fallback only |

**Decision Matrix**:
```
Need bidirectional?     → WebSocket
Browser-only client?    → SSE (simpler) or WebSocket
Behind corporate proxy? → SSE
LLM streaming?          → SSE (standard choice)
High-frequency trading? → WebSocket (lower latency)
```

## Performance Characteristics

### Bandwidth Efficiency
```javascript
// SSE token overhead per message
"event: token\ndata: \n\n"  // ~17 bytes overhead per token

// For 1000 tokens:
// 17 * 1000 = 17KB overhead
// Compare to WebSocket frame overhead: ~2-6 bytes
```

**Insight**: SSE has higher per-message overhead than WebSocket but negligible for text streaming where token payloads dominate.

### Latency
```
SSE: Client → Server: ~50-100ms (for first token, POST handling)
     Server → Client: ~5-20ms per token (network dependent)

WebSocket: Connection setup: ~100-200ms (full duplex)
           Per message: ~2-5ms (no HTTP headers)
```

**Trade-off**: WebSocket has lower steady-state latency but higher connection overhead. For LLM streaming where first-token latency dominates user experience, SSE's POST-based approach is acceptable.

## Best Practices

### 1. Handle Connection Drops
```javascript
// Client: Automatic reconnection with exponential backoff
const eventSource = new EventSource('/stream');
let reconnectDelay = 1000;

eventSource.onerror = () => {
  setTimeout(() => {
    eventSource.close();
    eventSource = new EventSource('/stream'); // Reconnect
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
};
```

**Why**: Network drops are common on mobile. SSE's automatic reconnection + custom backoff prevents thundering herd while providing resilience.

### 2. Heartbeat to Keep Alive
```javascript
// Server: Send comment lines every 30s
// Prevents proxies from closing idle connections
setInterval(() => {
  res.write(': heartbeat\n\n');
}, 30000);
```

**Proxy Behavior**: Proxies often close "idle" connections after 30-60s. Heartbeat comments keep the connection alive without changing semantic meaning.

### 3. Buffer Flushing
```javascript
res.flush?.();  // Node.js response.flush()
// Ensure tokens reach client immediately
```

**Issue**: Node buffers small writes. For real-time streaming, explicit flush ensures immediate delivery.

### 4. Graceful Degradation
```javascript
// Fallback to polling for environments without SSE
async function stream(prompt) {
  if (typeof EventSource !== 'undefined') {
    // Use SSE
  } else {
    // Polling fallback
    const response = await fetch('/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
    return response.json();
  }
}
```

## Common Pitfalls

| Pitfall | Cause | Solution |
|---------|-------|----------|
| **Nginx buffering** | Default nginx behavior | `X-Accel-Buffering: no` header |
| **CDN caching** | Cache headers | `Cache-Control: no-cache` |
| **Browser tab throttling** | Background tab limits | Chrome batches events |
| **Memory leaks** | Uncleaned listeners | `eventSource.close()` in all paths |
| **Missing `\n\n`** | Protocol error | Double newline terminates events |
| **Firewall closing** | Idle timeout | Heartbeat comments |

## Scaling Considerations

### Horizontal Scaling
```
                    ┌─────────────┐
                    │ Load Balancer│
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐     ┌─────────┐     ┌─────────┐
      │ Node 1  │     │ Node 2  │     │ Node 3  │
      │ (SSE)   │     │ (SSE)   │     │ (SSE)   │
      └─────────┘     └─────────┘     └─────────┘
```

**Challenge**: SSE connections are long-lived (minutes). Load balancers may close idle connections or route inconsistently.

**Solutions**:
1. **Sticky sessions**: Route same client to same node
2. **Redis pub/sub**: All nodes publish to Redis; subscribers receive events
3. **WebSocket upgrade**: If bidirectional needed, WebSocket may be simpler

### Connection Limits
| Server | Max Connections | Notes |
|--------|-----------------|-------|
| Node.js (default) | ~10,000 per process | Limited by file descriptors |
| nginx | ~20,000 per worker | Can increase |
| HTTP/2 | Multiplexed (single connection) | Reduces connection count |

## Summary

SSE provides the **simplest, most deployable** mechanism for streaming LLM responses. Its HTTP-native design means:
- Works through any proxy or firewall
- HTTP/2 provides efficiency gains
- Client-side `EventSource` is production-ready
- Protocol is human-debuggable

**When to choose alternatives**:
- Need bidirectional → WebSocket
- Need binary data → WebSocket
- Legacy browser support → Long-polling fallback
- Ultra-low latency → WebSocket (but likely unnecessary for LLM)

The LLM ecosystem has converged on SSE because the problem domain (unidirectional streaming text) is exactly what SSE was designed for.
