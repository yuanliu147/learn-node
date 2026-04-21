# TCP Connection Pool

## Concept
Connection pooling maintains a cache of reusable TCP connections to reduce overhead from establishing new connections.

## Why Connection Pools?

### Without Pooling
```
Request 1 --> SYN --> SYN-ACK --> ACK --> [Data] --> Close (RTT: 3)
Request 2 --> SYN --> SYN-ACK --> ACK --> [Data] --> Close (RTT: 3)
Request 3 --> SYN --> SYN-ACK --> ACK --> [Data] --> Close (RTT: 3)
```

### With Pooling
```
Request 1 --> SYN --> SYN-ACK --> ACK --> [Data]           (Initial)
Request 2 --> [Data] (reuse connection)                     (0 RTT)
Request 3 --> [Data] (reuse connection)                     (0 RTT)
Close --> FIN
```

## Node.js Agent Connection Pool

```javascript
const http = require('http');

// Default agent has maxSockets = Infinity (Node 18+) / 5 (older)
// maxFreeSockets = 2 (for older versions)

const agent = new http.Agent({
  maxSockets: 10,      // Max concurrent sockets per host
  maxFreeSockets: 5,   // Max idle sockets to keep
  timeout: 60000,      // Socket timeout
  scheduling: 'fifo',  // or 'lifo'
});

// Use with request
const req = http.request({
  hostname: 'example.com',
  port: 80,
  path: '/api/data',
  method: 'GET',
  agent: agent,
});
```

## Pooling Behavior

### Socket States
```
                    ┌──────────────┐
                    │    Idle      │<-- kept in free pool
                    └──────┬───────┘
                           │ request comes
                           v
                    ┌──────────────┐
                    │    Active    │--> in use by request
                    └──────┬───────┘
                           │ response done
                           v
                    ┌──────────────┐
                    │   Queued     │<-- waiting for free socket
                    └──────────────┘
```

### Queue Management
- Requests queue when all sockets busy
- FIFO or LIFO scheduling
- Sockets released back to pool on `close` event

## Connection Limits

### Per-Host Limits
```javascript
// Limit per destination host
const agent = new http.Agent({
  maxSockets: 5,
});

// Multiple hosts can each have 5 concurrent connections
// Host A: 5 sockets
// Host B: 5 sockets
// Host C: 5 sockets
```

### Global Limits
```javascript
const globalAgent = new http.Agent({
  maxSockets: 25,  // Total across all hosts
});
```

## Pool Exhaustion

### Symptoms
- Requests queuing
- Increased latency
- `socket hang up` errors under load

### Solutions
```javascript
const agent = new http.Agent({
  maxSockets: 10,
  timeout: 30000,
  // Enable timeout to release stuck connections
});

// Or implement custom pool with external library
const { Pool } = require('generic-pool');
const pool = new Pool({
  create: () => connection,
  destroy: (conn) => conn.end(),
  validate: (conn) => conn.isActive,
  max: 10,
  min: 2,
});
```

## Keep-Alive vs Connection:close

```
Connection: keep-alive  --> Socket reused (if agent supports)
Connection: close       --> Socket closed after response
```

## Related Nodes
- [[http-lifecycle]] - HTTP protocol flow
- [[keep-alive-optimization]] - Connection reuse strategy
- [[tls-handshake]] - HTTPS pooling considerations
