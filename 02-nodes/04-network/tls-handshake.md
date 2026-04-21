# TLS Handshake

## Overview
TLS (Transport Layer Security) handshake establishes a secure connection between client and server.

## TLS 1.2 Handshake (RSA)

```
Client                              Server
   |                                   |
   |-------- ClientHello ------------->|
   |    (TLS version, ciphers,         |
   |     random, session ID)           |
   |                                   |
   |<------- ServerHello --------------|
   |    (chosen cipher, random,        |
   |     session ID)                    |
   |                                   |
   |<------- Certificate --------------|
   |    (server public key,            |
   |     CA chain)                     |
   |                                   |
   |<------- ServerHelloDone --------->|
   |                                   |
   |-------- PreMasterSecret --------->|
   |    (encrypted with server's       |
   |     public key)                   |
   |                                   |
   |    [Both compute master secret]   |
   |                                   |
   |-------- ClientKeyExchange -------->|
   |-------- ChangeCipherSpec -------->|
   |-------- Finished ---------------->|
   |    (hash of all handshake msgs)   |
   |                                   |
   |<------- ChangeCipherSpec ---------|
   |<------- Finished -----------------|
   |    (hash of all handshake msgs)   |
   |                                   |
   |========= ENCRYPTED DATA =========>|
```

**Rounds: 2 RTT + CPU for encryption**

## TLS 1.3 Handshake (Improved)

```
Client                              Server
   |                                   |
   |-------- ClientHello ------------->|
   |    (supported ciphers,            |
   |     key share for DH)             |
   |                                   |
   |<------- ServerHello --------------|
   |    (selected cipher,              |
   |     key share, extensions)        |
   |                                   |
   |<------- {EncryptedExtensions} ----|
   |<------- {Certificate} ------------|
   |<------- {CertificateVerify} ------|
   |<------- {Finished} ---------------|
   |                                   |
   |-------- {Finished} -------------->|
   |    (all encrypted from here)      |
   |                                   |
   |========= ENCRYPTED DATA =========>|
```

**Rounds: 1 RTT (improved from 2)**

## Node.js TLS Options

### Client-Side
```javascript
const tls = require('tls');
const https = require('https');

const options = {
  hostname: 'example.com',
  port: 443,
  cert: fs.readFileSync('client.crt'),
  key: fs.readFileSync('client.key'),
  ca: [fs.readFileSync('ca.crt')],      // CA certificate
  rejectUnauthorized: true,             // Verify server cert
  // TLS versions
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
  // Session resumption
  sessionTimeout: 60000,
};

const req = https.request(options, (res) => {
  // Handle response
});
```

### Server-Side
```javascript
const tls = require('tls');
const https = require('https');
const fs = require('fs');

const serverOptions = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt'),
  ca: fs.readFileSync('ca.crt'),        // For client cert auth
  requestCert: false,                   // Require client cert
  rejectUnauthorized: false,            // Don't reject if no client cert
  // Secure options
  ciphers: 'TLS_AES_256_GCM_SHA384',
  honorCipherOrder: true,
  // Protocols
  minVersion: 'TLSv1.2',
};

const server = https.createServer(serverOptions, (req, res) => {
  res.end('Secure response');
});
```

## Session Resumption

### Session Tickets (Stateless)
```javascript
const sessionTickets = new Set();

// Client: receive and store ticket
req.on('session', (session) => {
  sessionTickets.add(session);
});

// Client: reuse ticket
const options = {
  hostname: 'example.com',
  port: 443,
  session: Array.from(sessionTickets)[0],  // Reuse previous session
};

// Server: enable session tickets
const serverOptions = {
  // ...
  sessionTimeout: 86400,
  // Ticket keys rotation recommended
};
```

### Session IDs (Stateful)
```javascript
// Server stores session context by ID
const sessions = new Map();

server.on('newSession', (sessionId, session) => {
  sessions.set(sessionId, session);
});

server.on('resumeSession', (sessionId, callback) => {
  callback(null, sessions.get(sessionId));
});
```

## TLS Cipher Suites

### Modern (TLS 1.3)
- `TLS_AES_256_GCM_SHA384`
- `TLS_AES_128_GCM_SHA256`
- `TLS_CHACHA20_POLY1305_SHA256`

### Compatible (TLS 1.2)
- `ECDHE-RSA-AES256-GCM-SHA384`
- `ECDHE-RSA-AES128-GCM-SHA256`
- `ECDHE-RSA-AES256-SHA384`

### Testing Ciphers
```javascript
// List supported ciphers
console.log(tls.getCiphers());

// Test connection
openssl s_client -connect example.com:443 -tls1_3
```

## Certificate Verification

```javascript
const https = require('https');

// Full verification
const options = {
  hostname: 'example.com',
  ca: fs.readFileSync('letsencrypt.crt'),  // Root CA
};

https.get(options, (res) => {
  console.log('Certificate valid');
}).on('error', (err) => {
  console.error('TLS error:', err.message);
});

// Certificate details (Node 11.7+)
const socket = tls.connect(443, 'example.com', {
  on: {
    cs: (info) => {
      console.log(info);
      // { version: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384', ... }
    }
  }
});
```

## Related Nodes
- [[http-lifecycle]] - HTTP over TLS
- [[keep-alive-optimization]] - TLS session resumption is related
- [[tcp-connection-pool]] - TCP-level connection handling
