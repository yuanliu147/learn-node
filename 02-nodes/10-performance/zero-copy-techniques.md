# Zero-Copy Techniques

## Concept

Zero-copy minimizes data copying between kernel and user space by transferring data directly between file descriptors without going through application memory.

```
Traditional:
  Disk → Kernel Buffer → User Buffer → Socket Buffer → Network
         ↑ Copy          ↑ Copy        ↑ Copy

Zero-Copy:
  Disk → Kernel Buffer → Network
         ↑ Copy (minimal)
```

## Why It Matters in Node.js

```javascript
// Traditional: reads entire file into memory
const fs = require('fs');
const data = fs.readFileSync('/large-file.zip');
response.write(data);

// Problem: 3 copies, high memory usage, slow for large files
```

## Zero-Copy Options in Node.js

### 1. fs.createReadStream + pipe

```javascript
const fs = require('fs');
const http = require('http');

http.createServer((req, res) => {
  const stream = fs.createReadStream('/large-file.zip');
  stream.pipe(res);
  // More efficient than readFile + write
  // Still copies to kernel once per chunk
}).listen(3000);
```

### 2. sendFile (Express)

```javascript
const express = require('express');
const app = express();

// Uses sendfile() syscall - kernel-level transfer
app.get('/download/:file', (req, res) => {
  res.sendFile('/path/to/files/' + req.params.file);
});
```

### 3. createWriteStream with pipe

```javascript
const fs = require('fs');
const readable = getDataStream();

// Kernel buffer → Kernel buffer (minimal copies)
const writable = fs.createWriteStream('/output');
readable.pipe(writable);
```

## sendFile Internals

```javascript
// Express sendFile uses:
// 1. fs.stat() to get file size
// 2. setHeader('Content-Length', size)
// 3. sendfile() syscall - zero-copy in kernel

// NOT the same as:
// fs.readFile() - reads to user space
// response.write() - writes from user space
```

## Buffer Pooling

Reuse buffers instead of allocating new ones:

```javascript
const { Pool } = require('generic-pool');

// Pre-allocate buffer pool
const bufferPool = Pool({
  create: () => Buffer.alloc(65536),  // 64KB buffers
  destroy: (buf) => { /* buffers auto-reclaim */ },
  validate: (buf) => buf.length === 65536,
});

async function processChunks(stream) {
  const buf = await bufferPool.acquire();
  try {
    stream.read(buf);  // Reuse buffer
  } finally {
    bufferPool.release(buf);
  }
}
```

## Using pipeline() Instead of pipe()

```javascript
const { pipeline } = require('stream/promises');
const fs = require('fs');

async function copyFile(src, dest) {
  const readable = fs.createReadStream(src);
  const writable = fs.createWriteStream(dest);
  
  // pipeline handles errors properly, cleans up
  await pipeline(readable, writable);
}
```

## SharedArrayBuffer for Worker Threads

```javascript
// main.js
const { Worker } = require('worker_threads');

const sharedBuffer = new SharedArrayBuffer(1024 * 1024);
const worker = new Worker('./processor.js', {
  workerData: { buffer: sharedBuffer }
});

// Zero-copy sharing between threads
```

```javascript
// processor.js
const { workerData } = require('worker_threads');
const buffer = workerData.buffer;  // Direct access, no copy!

// Process data directly in shared memory
```

## benchmarking Zero-Copy

```javascript
const fs = require('fs');
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/traditional') {
    const data = fs.readFileSync('/test-file');  // Full copy
    res.end(data);
  } else if (req.url === '/stream') {
    fs.createReadStream('/test-file').pipe(res);  // Chunked
  } else if (req.url === '/sendfile') {
    res.sendFile('/test-file');  // Kernel transfer
  }
});

// wrk -t1 -c1 -d10s http://localhost:3000/sendfile
```

## When to Use Each Approach

| Method | Copies | Memory | Best For |
|--------|--------|--------|----------|
| readFile + write | 4+ | High | Small files < 1MB |
| Stream + pipe | 2 | Medium | Medium files |
| sendFile | 1 | Low | Static file serving |
| splice/sendfile | 0 | Minimal | High-throughput servers |
| SharedArrayBuffer | 0 | Lowest | Worker thread data |

## Fast Static File Server Example

```javascript
const http = require('http');
const path = require('path');
const fs = require('fs');

const server = http.createServer((req, res) => {
  const filePath = path.join('/static', req.url);
  
  // Fast path: let kernel do the work
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Length': stat.size,
    'Content-Type': getMimeType(filePath),
  });
  
  // sendFile uses kernel sendfile() syscall
  fs.stat(filePath, (err, stat) => {
    if (err) {
      res.statusCode = 404;
      return res.end('Not Found');
    }
    fs.sendFile(req, filePath, (err) => {
      if (err) console.error('sendFile error:', err);
    });
  });
});

server.listen(3000);
```

## Key Takeaways

1. **sendFile()** is fastest for static files - uses kernel sendfile()
2. **Streams + pipe** balance memory and throughput
3. **Avoid readFile + write** for large files
4. **SharedArrayBuffer** enables zero-copy between workers
5. **Buffer pooling** reduces GC pressure
