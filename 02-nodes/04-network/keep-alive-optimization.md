# Keep-Alive Optimization

## What is Keep-Alive?
HTTP Keep-Alive (persistent connections) allows multiple HTTP requests over a single TCP connection, avoiding connection establishment overhead.

## Connection Reuse Timeline

```
Without Keep-Alive:
[Conn 1: SYN+ACK+GET+RESP+FIN] [Conn 2: SYN+ACK+GET+RESP+FIN] ...

With Keep-Alive:
[Conn: SYN+ACK+GET+RESP+GET+RESP+GET+RESP+FIN]
```

## HTTP Keep-Alive Header

```
Connection: Keep-Alive
Keep-Alive: timeout=5, max=100
```

- `timeout`: How long to keep connection open (seconds)
- `max`: Max requests before closing (deprecated in HTTP/2)

## Node.js Keep-Alive Behavior

### Default Agent (HTTP/1.1)
HTTP/1.1 defaults to persistent connections - no `Connection: close` sent.

```javascript
// http.globalAgent maintains a connection pool
// Connections are kept alive automatically

// To disable keep-alive for specific request:
const req = http.request({
  hostname: 'example.com',
  agent: new http.Agent({
    keepAlive: false,
  }),
});
```

### Enabling Keep-Alive

```javascript
const http = require('http');

const agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,     // Initial delay for keep-alive probe
  maxSockets: 10,
  maxFreeSockets: 5,
});

// Or use https.globalAgent for HTTPS
const https = require('https');
const httpsAgent = new https.Agent({
  keepAlive: true,
  // Certificate handling...
});
```

## Keep-Alive Timeout

### Server-Side
```javascript
const server = http.createServer({
  keepAliveTimeout: 5000,  // 5 seconds (Node.js default)
  // After this, unused connection closed
});
```

### Client-Side
```javascript
const agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,    // Probe interval (Node.js default)
});
```

## Connection Lifecycle with Keep-Alive

```
1. Request 1 --> [SYN+ACK] --> [GET] --> [RESP] --> idle (keep-alive)
2. Request 2 -----------------------------------> [GET] --> [RESP]
3. Request 3 -----------------------------------> [GET] --> [RESP]
...
N. Request N or Timeout --> [FIN] --> connection closed
```

## Performance Benefits

| Metric | Without Keep-Alive | With Keep-Alive |
|--------|-------------------|-----------------|
| Connections | N (one per request) | 1 |
| TCP Handshakes | N × 3 RTT | 1 × 3 RTT |
| TLS Handshakes | N (HTTPS) | 1 (HTTPS) |
| Latency | Higher | Lower |
| Server resources | More sockets | Fewer sockets |

## Common Issues

### Stale Connections
```javascript
// Connection may be closed by server while idle
// Socket 'error' or 'close' events fire unexpectedly

const agent = new http.Agent({ keepAlive: true });

// Handle stale connections
socket.on('error', (err) => {
  console.log('Connection error:', err.message);
  // Agent will remove dead socket from pool
});
```

### Header Contamination
```javascript
// Responses with Connection: close must not be reused
// Agent automatically handles this

req.on('response', (res) => {
  if (res.headers['connection'] === 'close') {
    // This socket will be destroyed, not reused
  }
});
```

## HTTP/2 Connection Multiplexing

HTTP/2 doesn't use Keep-Alive in the same way - instead:
- Single TCP connection
- Multiple parallel streams (multiplexing)
- No head-of-line blocking (with multiplexing)

```javascript
// HTTP/2 uses a different connection model
const http2 = require('http2');
const client = http2.connect('https://example.com');

// Multiple requests share single connection
const req1 = client.request({ ':path': '/api1' });
const req2 = client.request({ ':path': '/api2' });
```

## Related Nodes
- [[tcp-connection-pool]] - Socket pooling
- [[http-lifecycle]] - Full HTTP lifecycle
- [[tls-handshake]] - TLS session resumption (related optimization)
