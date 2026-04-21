# WebSocket Internals

## Overview
WebSocket provides full-duplex communication over a single TCP connection, enabling real-time bidirectional data transfer.

## Connection Upgrade

### HTTP to WebSocket Upgrade Flow
```
Client                              Server
   |                                   |
   |------ HTTP GET (with headers) --->|
   |    Upgrade: websocket             |
   |    Connection: Upgrade            |
   |    Sec-WebSocket-Key: dGhl...     |
   |    Sec-WebSocket-Version: 13      |
   |                                   |
   |<----- HTTP 101 Switching Protocols|
   |    Upgrade: websocket             |
   |    Connection: Upgrade            |
   |    Sec-WebSocket-Accept: s3pPL... |
   |                                   |
   |====== WebSocket Connection =======>|
   |    (full-duplex, frame-based)     |
```

### Node.js WebSocket Server
```javascript
const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ 
  port: 8080,
  // or integrate with HTTP server:
  // server: httpServer,
});

wss.on('connection', (ws, req) => {
  // ws: WebSocket object
  // req: HTTP request (for headers, URL, etc.)
  
  ws.on('message', (data, isBinary) => {
    // data: string or Buffer
    // isBinary: boolean
    console.log('received:', data.toString());
    
    // Send response
    ws.send('Hello back');
  });
  
  ws.on('close', (code, reason) => {
    // code: close code (1000 = normal)
    // reason: string description
  });
  
  ws.on('error', (error) => {
    // Handle error
  });
  
  // Optional: keep-alive ping
  ws.on('ping', (data) => {
    ws.pong(data);
  });
});

// Broadcast to all clients
wss.clients.forEach((client) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send('broadcast message');
  }
});
```

## WebSocket Frame Format

### Frame Structure
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+---------------+-+---------------+-+---------------+-------------+
|F|R|R|R| Opcode |M|     Mask      |         Payload length         |
|I|S|S|S|  (4)   |A|     (1)       |         (7 or 7+16 or 7+64)    |
|N|V|V|V|         |S|               |         (variable)            |
+-+---------------+-+---------------+-+---------------+-------------+
|                 Masking key (if mask set)                          |
+--------------------------------------------------------------------+
|                         Payload data                               |
+--------------------------------------------------------------------+
```

### Opcodes
| Opcode | Meaning |
|--------|---------|
| 0x0 | Continuation frame |
| 0x1 | Text frame |
| 0x2 | Binary frame |
| 0x8 | Connection close |
| 0x9 | Ping |
| 0xA | Pong |

### Client-Side Masking
- All frames from client to server MUST be masked
- Mask key: 4 bytes random
- XOR masking prevents cache poisoning attacks

## WebSocket Client (ws library)

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/path', {
  protocolVersion: 13,        // Default
  headers: { 'Custom-Header': 'value' },
  // TLS options for wss://
  cert: fs.readFileSync('client.crt'),
  key: fs.readFileSync('client.key'),
});

ws.on('open', () => {
  console.log('Connected');
  ws.send('Hello server');
});

ws.on('message', (data, isBinary) => {
  console.log('Received:', isBinary ? data : data.toString());
});

ws.on('close', (code, reason) => {
  console.log('Closed:', code, reason.toString());
});

ws.on('error', (error) => {
  console.error('Error:', error.message);
});

// Manual ping/pong
ws.ping('keep-alive');
ws.on('pong', (data) => {
  // Response to ping
});

// Graceful close
ws.close(1000, 'Normal closure');
```

## Subprotocol Negotiation

```javascript
// Server
const wss = new WebSocketServer({
  port: 8080,
  handleProtocols: (protocols, req) => {
    // protocols: array from client Sec-WebSocket-Protocol
    // Return selected protocol or false to reject
    if (protocols.includes('json')) return 'json';
    return protocols[0];
  },
});

wss.on('connection', (ws, req) => {
  console.log('Protocol:', ws.protocol);  // 'json'
});

// Client
const ws = new WebSocket('ws://localhost:8080', ['json', 'xml']);
```

## Frame fragmentation

```javascript
// Server handling large messages
let message = '';

ws.on('message', (chunk, isBinary) => {
  if (isBinary) {
    // Binary: concatenate buffers
    message = Buffer.concat([message, chunk]);
  } else {
    // Text: may come in multiple frames
    // opcode 0x1 for first, 0x0 for continuation
    message += chunk;
  }
});

// With ws fragmentation is usually handled automatically
// This shows the underlying mechanism
```

## Heartbeat / Keep-Alive

```javascript
// Server-side heartbeat
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

// Interval to check connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();  // Force close
      return;
    }
    ws.isAlive = false;
    ws.ping();         // Trigger pong response
  });
}, 30000);
```

## Security Considerations

### Origin Checking
```javascript
const wss = new WebSocketServer({
  port: 8080,
  verifyClient: (info, done) => {
    // info.req: incoming request
    // Check Origin or other headers
    const origin = info.req.headers.origin;
    if (origin === 'https://allowed.com') {
      done(true);  // Accept
    } else {
      done(false, 401, 'Unauthorized');  // Reject
    }
  },
});
```

### Rate Limiting
```javascript
// Implement per-connection rate limiting
const connections = new Map();

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  connections.set(ip, { count: 0, lastReset: Date.now() });
  
  ws.on('message', (data) => {
    const conn = connections.get(ip);
    const now = Date.now();
    
    // Reset counter every minute
    if (now - conn.lastReset > 60000) {
      conn.count = 0;
      conn.lastReset = now;
    }
    
    conn.count++;
    if (conn.count > 1000) {
      ws.close(1008, 'Rate limit exceeded');
    }
  });
});
```

## Related Nodes
- [[http-lifecycle]] - HTTP upgrade mechanism
- [[tcp-connection-pool]] - Underlying TCP connection
- [[keep-alive-optimization]] - Connection management
