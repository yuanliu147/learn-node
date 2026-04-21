# SSE Streaming (Server-Sent Events)

## Concept

Server-Sent Events (SSE) is a unidirectional communication protocol that allows a server to push real-time updates to a client over HTTP. Unlike WebSocket, SSE is one-way only (server → client) but works seamlessly with HTTP/2, automatic reconnection, and is easier to implement behind proxies.

SSE is the preferred choice for streaming LLM responses because:
- Native support in browsers via `EventSource` API
- Automatic reconnection on network failure
- Works through standard HTTP proxies (unlike WebSocket)
- Text-based, human-readable protocol
- HTTP/2 multiplexing support

## Architecture

```
Client                    Server
  │                         │
  │──── GET /stream ────────>│
  │                         │
  │<─── event: token ────────│  (streaming tokens)
  │<─── event: token ────────│
  │<─── event: token ────────│
  │                         │
  │<─── event: done ─────────│  (completion signal)
  │                         │
  │    (connection stays open for next request)
```

## SSE Protocol Format

```
event: token
data: {"content": "Hello"}

event: token
data: {"content": " World"}

event: done
data: {"usage": {"total_tokens": 50}}

```

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

## Client-Side Usage

```javascript
// Browser EventSource
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

## SSE vs WebSocket vs Long-Polling

| Feature | SSE | WebSocket | Long-Polling |
|---------|-----|-----------|--------------|
| Direction | Server → Client | Bidirectional | Request-Response |
| Protocol | HTTP/1.1+ | ws:// | HTTP |
| Browser Support | Native EventSource | Manual impl | Polyfill |
| Reconnection | Automatic | Manual | Automatic |
| Proxy Support | ✅ Yes | ❌ No | ✅ Yes |
| Binary Data | Base64 only | Native | ✅ Yes |
| Complexity | Low | Medium | High |
| Use Case | LLM streaming, feeds | Real-time games, chat | Fallback |

## Best Practices

### 1. Handle Connection Drops
```javascript
// Client: Automatic reconnection with backoff
const eventSource = new EventSource('/stream');
let reconnectDelay = 1000;

eventSource.onerror = () => {
  setTimeout(() => {
    eventSource.close();
    // Reconnect logic here
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
};
```

### 2. Heartbeat to Keep Alive
```javascript
// Server: Send comment lines every 30s
setInterval(() => {
  res.write(': heartbeat\n\n');
}, 30000);
```

### 3. Buffer Flushing
```javascript
res.flush?.();  // Node.js response.flush()
// Ensure tokens reach client immediately
```

## Common Pitfalls

1. **Nginx buffering**: Disable with `X-Accel-Buffering: no`
2. **CDN caching**: Ensure cache headers prevent caching
3. **Browser tab throttling**: Tabs in background may batch events
4. **Memory leaks**: Clean up event listeners on close
5. **Missing CRLF**: SSE requires double newline `\n\n`

## Summary

SSE provides the simplest, most reliable mechanism for streaming LLM responses to clients. Its HTTP-native design makes it deployable anywhere, while automatic reconnection handles network issues gracefully.
