# HTTP Lifecycle

## Overview
Understanding the complete HTTP request/response lifecycle is fundamental to Node.js networking.

## Lifecycle Stages

### 1. Connection Establishment
```
Client                          Server
   |                              |
   |------ TCP SYN --------------->|
   |<----- SYN-ACK --------------|
   |------ ACK ------------------>|
   |                              |
   |------ TLS Handshake -------->|
   |<----- Certificate ---------->|
   |<----- Key Exchange --------->|
   |<----- Finished ------------->|
   |------ Finished ------------>|
   |                              |
```

### 2. Request Formation
- Method (GET, POST, PUT, DELETE, etc.)
- URL/Path and Query String
- Headers (Host, User-Agent, Content-Type, Accept)
- Body (for POST/PUT requests)

### 3. Request Sending
- Node.js `http.request()` or `http.get()`
- Data buffering and chunking
- Transfer-Encoding handling

### 4. Server Processing
1. Parse request line
2. Parse headers
3. Route matching
4. Middleware chain execution
5. Handler processing
6. Response preparation

### 5. Response Sending
- Status code (1xx, 2xx, 3xx, 4xx, 5xx)
- Response headers
- Response body
- Connection handling (close/keep-alive)

### 6. Connection Termination
- Normal close (FIN handshake)
- Abrupt close (RST packet)
- Keep-alive reuse

## Node.js HTTP Module States

```
mikeHeadersRecvd  --> mikeSending  --> mikeWriteComplete  --> mikeKeepAlive
mikeIdle          --> mikeWriting
mikeClosed
```

## Key Events in Node.js

```javascript
const http = require('http');

const req = http.request(options, (res) => {
  // 'response' - received response headers
  // 'data' - chunk of body received
  // 'end' - body fully received
  
  res.on('data', (chunk) => { /* process chunk */ });
  res.on('end', () => { /* complete */ });
});

req.on('socket', (socket) => {
  // Socket assigned to request
});

req.on('response', (res) => {
  // Response headers received
});

req.on('close', () => {
  // Connection closed
});
```

## Common Status Codes

| Code | Meaning | Common Use |
|------|---------|------------|
| 200 | OK | Successful GET/POST |
| 201 | Created | Resource created |
| 204 | No Content | Successful DELETE |
| 301 | Moved Permanently | Redirect |
| 304 | Not Modified | Cached response |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing auth |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Missing resource |
| 500 | Internal Server Error | Handler crash |

## Related Nodes
- [[tcp-connection-pool]] - Underlying TCP connections
- [[keep-alive-optimization]] - Connection reuse
- [[tls-handshake]] - Secure connections
