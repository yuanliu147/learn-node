# HTTP Lifecycle

> **Architecture Perspective**: HTTP in Node.js is a **state machine managing a shared, finite resource: TCP connections**. Every phase of the lifecycle — connection establishment, request handling, keep-alive reuse — involves explicit architectural decisions about concurrency, memory, and latency.

## The HTTP Connection State Machine

HTTP sits on top of TCP (and optionally TLS). The lifecycle is a sequence of state transitions, each consuming or releasing resources.

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

**Key architectural insight**: Each connection transitions through these states. The server's concurrency model determines how many connections can be in `WRITING`/`SENDING` simultaneously. Node.js's event loop handles all states concurrently — no thread per connection.

## Phase 1: Connection Establishment (TCP + TLS)

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

**Architecture decisions**:
- **TCP_NODELAY**: Disables Nagle's algorithm — reduces latency for interactive requests at cost of more packets
- **TLS session reuse**: Avoids full handshake on every request. `session` ticket enables 0-RTT resumption
- **Connection pooling**: Reuse TCP connections across requests (keep-alive)

## Phase 2: Request Parsing

```javascript
const http = require('http');

const server = http.createServer((req, res) => {
  // req is a Readable stream
  // req.headers - parsed headers
  // req.method  - GET, POST, etc.
  // req.url     - path + query string
});
```

**Parsing pipeline**:
1. **Request line**: `GET /path?query=value HTTP/1.1` → method, url, http version
2. **Headers**: Key-value pairs, folded lines joined
3. **Body**: Streaming into `req` readable buffer

**Architecture**: `http.IncomingMessage` is a Readable stream. This means you can `pipe()`, `pipeline()`, apply backpressure — standard stream semantics.

## Phase 3: Response Writing

```javascript
res.writeHead(200, { 'Content-Type': 'application/json' });
res.write(JSON.stringify(data));
res.end();
```

**State transitions**:
```
res.writeHead()  →  headers sent, state → mikeWriteComplete
res.write()      →  body chunks sent, state → mikeSending
res.end()        →  response complete, state → mikeKeepAlive (if keep-alive)
```

**Architecture**: `res` is a Writable stream. Same backpressure contract applies — `res.write()` returns `false` when the socket buffer is full.

## Phase 4: Connection Reuse (Keep-Alive)

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

**Keep-Alive trade-offs**:

| Setting | Benefit | Cost |
|---------|---------|------|
| `keepAlive: true` | Eliminates TCP + TLS handshake overhead for repeat requests | Connection holds server memory |
| `keepAliveTimeout` | Bounds idle connection lifetime | Closes connections that could be reused |
| `maxSocketsPerHost` | Prevents connection exhaustion | Limits parallelism to that host |

```javascript
const agent = new http.Agent({
  keepAlive: true,
  maxSocketsPerHost: 10,
  maxFreeSockets: 5,
  timeout: 60000,
});
```

**Architecture**: Connection pools are shared across requests. Mismanaging pool size causes either connection starvation (too few) or resource exhaustion (too many).

## The Socket as a Managed Resource

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

**Socket lifecycle events**:
- `socket` — Socket assigned to request
- `connect` — TCP handshake complete (+ TLS if applicable)
- `response` — HTTP response headers received
- `data` — Body chunk received
- `end` — Body fully received
- `close` — Underlying connection closed

## Architecture: Request/Response as Streams

```
Client                                          Server
   │                                               │
   │─────────── Outgoing Request (Writable) ──────▶│
   │  (backpressure applies if server is slow)     │
   │                                               │
   │◀────────── Incoming Response (Readable) ◀─────│
   │  (server backpressure applies if client slow) │
```

**Key architectural pattern**: HTTP in Node.js is **stream-oriented end-to-end**. The request body is a readable stream from the client; the response body is a readable stream to the client. Both support backpressure.

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

## Node.js HTTP Server State Machine

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

**Architecture insight**: The server can only handle ONE request at a time per connection (HTTP/1.1). `mikeWriting` and `mikeSending` are mutually exclusive per socket. Concurrency comes from multiple connections, not pipelining (which is rarely used).

## Common Status Codes (Architectural Meaning)

| Code | Class | Architectural Meaning |
|------|-------|----------------------|
| 200 | 2xx | Success — response body is valid |
| 201 | 2xx | Created — idempotent PUT success |
| 204 | 2xx | No Content — response body intentionally empty |
| 301/302 | 3xx | Redirect — client must follow with new request |
| 304 | 3xx | Not Modified — use cached response (no body) |
| 400 | 4xx | Client error — bad request, don't retry same input |
| 401 | 4xx | Unauthorized — authentication required |
| 403 | 4xx | Forbidden — authenticated but not authorized |
| 404 | 4xx | Not Found — resource doesn't exist |
| 429 | 4xx | Too Many Requests — client should back off (backpressure!) |
| 500 | 5xx | Server error — bug, retry may succeed |
| 502/503 | 5xx | Upstream error — proxy/gateway failure |

**Architecture**: Status codes communicate WHO is responsible for the error (client vs. server) and WHAT the client should do next (retry, redirect, back off).

## HTTP/2 Considerations (Upgrade Path)

HTTP/1.1 has a fundamental concurrency limitation: one request per connection (head-of-line blocking). HTTP/2 multiplexes multiple requests over a single connection:

```
HTTP/1.1:  Connection 1 → Request A → Response A → Request B → Response B
                       (sequential, blocking)

HTTP/2:    Connection 1 → Request A ──────────────────────────▶ Response A
                       → Request B ───────▶ Response B
                       → Request C ──▶ Response C
                       (parallel, non-blocking)
```

**Architecture decision**: If building high-concurrency services, HTTP/2 removes the need for connection pooling on the client side. Node.js supports HTTP/2 via `http2` module.

## Related Architecture Patterns

| Pattern | Related Node |
|---------|-------------|
| Connection pooling | [[tcp-connection-pool]] |
| Keep-alive tuning | [[keep-alive-optimization]] |
| TLS session reuse | [[tls-handshake]] |
| HTTP/2 multiplexing | [[http2-upgrade]] |
| Request backpressure | [[backpressure-mechanism]] |
| Stream pipeline composition | [[pipeline-vs-pipe]] |
