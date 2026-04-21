---
title: "IPC and Serialization in Node.js"
description: "Inter-Process Communication mechanisms in Node.js - pipes, sockets, message channels, and serialization formats"
tags:
  - nodejs
  - ipc
  - serialization
  - inter-process
  - messaging
  - pipes
  - sockets
related:
  - cluster-load-balance
  - node-startup-flow
  - worker-threads
---

# IPC and Serialization in Node.js

**Inter-Process Communication (IPC)** is fundamental to Node.js applications - enabling communication between the master and worker processes in the cluster module, child processes, and Worker threads. Understanding IPC mechanisms and serialization formats is essential for building performant distributed systems.

## IPC Mechanisms Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    IPC Mechanisms in Node.js                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   Pipes     │    │   Sockets   │    │   Message   │        │
│   │             │    │             │    │   Channels  │        │
│   ├─────────────┤    ├─────────────┤    ├─────────────┤        │
│   │ - Anonymous │    │ - TCP       │    │ - Worker    │        │
│   │ - Named     │    │ - UNIX      │    │   threads   │        │
│   │ - IPC pipe  │    │ - UDP       │    │ - Shared    │        │
│   │             │    │             │    │   memory    │        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
│   Used by:                       Used by:                       │
│   - child_process                 - cluster module              │
│   - cluster module               - Worker class                │
│   - stdio forwarding              - MessageChannel               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Anonymous Pipes (stdin/stdout/stderr)

### Basic Pipe Usage

```javascript
const { spawn } = require('child_process');

// Create child process with piped stdin/stdout/stderr
const child = spawn('wc', ['-l'], {
    stdio: ['pipe', 'pipe', 'pipe']
});

// Write to child's stdin
child.stdin.write('line one\n');
child.stdin.write('line two\n');
child.stdin.write('line three\n');
child.stdin.end();  // Close stdin

// Read from child's stdout
child.stdout.on('data', (data) => {
    console.log(`Output: ${data}`);
});

// Read from child's stderr
child.stderr.on('data', (data) => {
    console.error(`Error: ${data}`);
});

child.on('close', (code) => {
    console.log(`Child exited with code ${code}`);
});
```

### Connecting to Parent's stdio

```javascript
// Inherit parent's stdio - child uses same terminal
const child = spawn('ls', ['-la'], {
    stdio: 'inherit'  // All three streams inherited
});

// Or inherit specific streams
const child2 = spawn('node', ['worker.js'], {
    stdio: ['ignore', 'pipe', 'pipe']
    // 0: ignore (stdin)
    // 1: pipe (stdout) 
    // 2: pipe (stderr)
});
```

## Named Pipes (FIFOs)

### Creating and Using Named Pipes

```bash
# Create a named pipe
mkfifo /tmp/my-pipe

# Write to pipe (in one terminal)
echo "hello" > /tmp/my-pipe

# Read from pipe (in another terminal)
cat /tmp/my-pipe
```

```javascript
// writer.js - Writing to named pipe
const fs = require('fs');

const pipePath = '/tmp/my-pipe';

// Open pipe for writing (blocks until reader opens)
const pipe = fs.openSync(pipePath, 'w');

// Write data
fs.writeSync(pipe, 'Message through pipe\n');
fs.writeSync(pipe, 'Another message\n');

// reader.js - Reading from named pipe
const fs = require('fs');

const pipePath = '/tmp/my-pipe';

// Open pipe for reading (blocks until writer opens)
const pipe = fs.openSync(pipePath, 'r');

let data;
while ((data = fs.readFileSync(pipe, 1024)) && data.length > 0) {
    console.log('Received:', data.toString());
}
```

### IPC Channel with child_process

```javascript
// parent.js
const { fork } = require('child_process');

const child = fork('./child.js');

// Send messages through IPC channel
child.send({ type: 'command', action: 'start' });
child.send({ type: 'config', port: 3000 });

// Receive messages from child
child.on('message', (msg) => {
    console.log('From child:', msg);
});

child.on('exit', (code) => {
    console.log(`Child exited with ${code}`);
});

// child.js
process.on('message', (msg) => {
    console.log('From parent:', msg);
    
    // Respond to parent
    process.send({ type: 'status', ready: true });
});

// Let parent know we're ready
process.send({ type: 'ready' });
```

## Serialization Formats

### JSON Serialization (Default)

```javascript
// Simple JSON - works with all Node.js versions
const data = { 
    type: 'user:created',
    payload: {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        created: new Date().toISOString()
    }
};

// Serialization
const serialized = JSON.stringify(data);
// '{"type":"user:created","payload":{"id":1,"name":"John",...}}'

// Deserialization
const parsed = JSON.parse(serialized);

// Limitations:
// - Large overhead for repeated field names
// - No support for binary data
// - No type safety
// - Slow for large datasets
```

### MessagePack (Binary Serialization)

```javascript
// msgpack-lite - efficient binary format
const msgpack = require('msgpack-lite');

const data = {
    type: 'user:created',
    payload: {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        created: new Date().toISOString()
    }
};

// Encode to binary
const encoded = msgpack.encode(data);
// <Buffer 82 a4 74 79 70 65 ...>  (much smaller than JSON)

// Decode from binary
const decoded = msgpack.decode(encoded);

// Advantages:
// - Binary format - smaller size
// - Faster encoding/decoding
// - Preserves type information
```

### Protocol Buffers

```javascript
// protobufjs - Google's binary format
const protobuf = require('protobufjs');

// Define schema
const schema = `
syntax = "proto3";

message UserEvent {
    string type = 1;
    UserPayload payload = 2;
}

message UserPayload {
    uint32 id = 1;
    string name = 2;
    string email = 3;
    string created_at = 4;
}
`;

const root = protobuf.parse(schema).root;
const UserEvent = root.lookupType('UserEvent');

const event = UserEvent.create({
    type: 'user:created',
    payload: {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        created_at: new Date().toISOString()
    }
});

// Encode
const encoded = UserEvent.encode(event).finish();
// Very compact binary representation

// Decode
const decoded = UserEvent.decode(encoded);
```

### Comparison of Serialization Methods

| Format | Size | Speed | Schema | Binary Support |
|--------|------|-------|--------|-----------------|
| JSON | Large | Medium | No | No |
| MessagePack | Medium | Fast | No | Yes |
| Protocol Buffers | Very Small | Very Fast | Yes | Yes |
| Thrift | Small | Fast | Yes | Yes |

## IPC in Cluster Module

### Message Passing Between Master and Workers

```javascript
const cluster = require('cluster');

if (cluster.isPrimary) {
    const worker = cluster.fork();
    
    // Send message to worker
    worker.send({
        type: 'task',
        data: { jobId: 123, priority: 'high' }
    });
    
    // Receive message from worker
    worker.on('message', (msg) => {
        if (msg.type === 'task:complete') {
            console.log(`Job ${msg.data.jobId} finished`);
        }
    });
    
} else {
    // Worker process
    const http = require('http');
    
    // Receive message from master
    process.on('message', (msg) => {
        if (msg.type === 'task') {
            const result = processTask(msg.data);
            
            // Send result back to master
            process.send({
                type: 'task:complete',
                data: { jobId: msg.data.jobId, result }
            });
        }
    });
    
    process.send({ type: 'ready' });
}
```

### Broadcasting to All Workers

```javascript
const cluster = require('cluster');

if (cluster.isPrimary) {
    const numCPUs = require('os').cpus().length;
    
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    // Broadcast message to all workers
    function broadcast(msg) {
        for (const id in cluster.workers) {
            cluster.workers[id].send(msg);
        }
    }
    
    // Example: notify all workers of shutdown
    process.on('SIGTERM', () => {
        broadcast({ type: 'shutdown', timeout: 30000 });
    });
    
} else {
    process.on('message', (msg) => {
        if (msg.type === 'shutdown') {
            console.log(`Worker ${process.pid} shutting down in ${msg.timeout}ms`);
            setTimeout(() => {
                process.exit(0);
            }, msg.timeout);
        }
    });
}
```

## MessageChannel (Worker Threads)

```javascript
const { Worker, MessageChannel } = require('worker_threads');

// Create a message channel
const channel = new MessageChannel();

// Get the two ports (ends of the channel)
const port1 = channel.port1;
const port2 = channel.port2;

// Set up message handlers
port1.on('message', (msg) => {
    console.log('Port 1 received:', msg);
});

port2.on('message', (msg) => {
    console.log('Port 2 received:', msg);
});

// Start receiving
port1.start();
port2.start();

// Send messages
port1.postMessage({ from: 'port1', data: 'hello' });
port2.postMessage({ from: 'port2', data: 'world' });

// Close when done
port1.close();
port2.close();
```

## SharedArrayBuffer (Zero-Copy IPC)

```javascript
// Worker with shared memory
const { Worker } = require('worker_threads');
const assert = require('assert');

// Create shared buffer (64 bytes)
const sharedBuffer = new SharedArrayBuffer(64);
const sharedArray = new Int32Array(sharedBuffer);

// Create worker with shared buffer
const worker = new Worker('./worker.js', {
    workerData: { sharedBuffer }
});

// In worker.js:
const { workerData, parentPort } = require('worker_threads');

const sharedArray = new Int32Array(workerData.sharedBuffer);

// Atomics for synchronization
Atomics.add(sharedArray, 0, 1);  // Increment counter
const value = Atomics.load(sharedArray, 0);

// Notify parent
parentPort.postMessage({ type: 'shared', counter: value });
```

## Performance Considerations

### Serialization Overhead

```javascript
// Benchmarking serialization methods
const Benchmark = require('benchmark');
const msgpack = require('msgpack-lite');

const largeData = {
    users: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        active: true,
        score: Math.random() * 100
    }))
};

const suite = new Benchmark.Suite();

suite.add('JSON.stringify', () => {
    const serialized = JSON.stringify(largeData);
    const parsed = JSON.parse(serialized);
});

suite.add('msgpack.encode', () => {
    const encoded = msgpack.encode(largeData);
    const decoded = msgpack.decode(encoded);
});

suite.on('cycle', (event) => {
    console.log(event.target.toString());
});
```

### Batched Messages

```javascript
// BAD: Individual messages - high overhead
for (const item of largeArray) {
    worker.postMessage({ type: 'item', data: item });
}

// GOOD: Batched messages - lower overhead
const BATCH_SIZE = 100;
const batches = [];

for (let i = 0; i < largeArray.length; i += BATCH_SIZE) {
    batches.push(largeArray.slice(i, i + BATCH_SIZE));
}

for (const batch of batches) {
    worker.postMessage({ type: 'batch', data: batch });
}
```

### Zero-Copy with Transferables

```javascript
// Transfer ownership (zero-copy)
const buffer = new ArrayBuffer(1024 * 1024);  // 1MB

worker.postMessage({ 
    type: 'data', 
    buffer: buffer 
}, [buffer]);  // Transfer the buffer

// After transfer, buffer is detached in this context
// buffer.byteLength === 0

// Clone (copies data)
const data = { big: new Uint8Array(1024 * 1024) };
worker.postMessage({ type: 'data', data });  // Data is cloned
```

## Error Handling

### IPC Connection Errors

```javascript
const cluster = require('cluster');

if (cluster.isPrimary) {
    cluster.fork().on('error', (err) => {
        console.error('Worker error:', err);
    });
}

if (cluster.isWorker) {
    process.on('disconnect', () => {
        console.log('Disconnected from master');
        // Handle cleanup
    });
    
    process.on('message', (msg) => {
        if (msg.type === 'crash') {
            // Clean up and exit
            process.exit(1);
        }
    });
}
```

### Reconnection Strategies

```javascript
class IPCReconnector {
    constructor(options = {}) {
        this.retryDelay = options.retryDelay || 1000;
        this.maxRetries = options.maxRetries || 10;
        this.onReconnect = options.onReconnect;
    }
    
    scheduleReconnect(attempt = 1) {
        if (attempt > this.maxRetries) {
            console.error('Max retries reached');
            return;
        }
        
        setTimeout(() => {
            console.log(`Reconnect attempt ${attempt}`);
            // Attempt reconnection
            this.onReconnect(attempt);
        }, this.retryDelay * attempt);
    }
}
```

## Best Practices

### 1. Use Typed Arrays for Binary Data

```javascript
// BAD: Sending large arrays as JSON
const largeArray = new Float64Array(1000000);
process.send({ data: Array.from(largeArray) });  // Very slow

// GOOD: Send as typed array (transferable)
const largeArray = new Float64Array(1000000);
process.send({ data: largeArray.buffer }, [largeArray.buffer]);
```

### 2. Message Protocol Design

```javascript
// Define a message protocol
const MessageProtocol = {
    // Message format:
    // { type: string, id: string, payload: any, timestamp: number }
    
    create(type, payload) {
        return {
            type,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            payload,
            timestamp: Date.now()
        };
    },
    
    validate(msg) {
        return msg && 
               typeof msg.type === 'string' && 
               typeof msg.id === 'string' &&
               msg.timestamp !== undefined;
    }
};

// Usage
const msg = MessageProtocol.create('user:action', { userId: 123 });
process.send(msg);
```

### 3. Handle Backpressure

```javascript
// Drain message queue when overwhelmed
const { Worker } = require('worker_threads');

class MessageQueue {
    constructor(worker) {
        this.worker = worker;
        this.pending = [];
        this.sending = false;
    }
    
    send(msg) {
        this.pending.push(msg);
        this.drain();
    }
    
    drain() {
        if (this.sending || this.pending.length === 0) return;
        
        this.sending = true;
        const msg = this.pending.shift();
        
        this.worker.postMessage(msg, () => {
            this.sending = false;
            this.drain();  // Continue with next
        });
    }
}
```

## Key Takeaways

1. **Node.js uses pipes and sockets** for IPC - hidden complexity handled by cluster/child_process modules
2. **JSON is the default** but binary formats (MessagePack, Protobuf) are more efficient
3. **Transferables enable zero-copy** - ArrayBuffers can be transferred instead of cloned
4. **SharedArrayBuffer enables** true shared memory between threads
5. **Atomics provide synchronization** for shared memory access
6. **Message protocols should be explicit** - define message types, IDs, and validation
7. **Connection handling matters** - handle disconnects and plan for reconnection

## References

- [Node.js child_process](https://nodejs.org/api/child_process.html)
- [Node.js cluster module](https://nodejs.org/api/cluster.html)
- [Worker Threads](https://nodejs.org/api/worker_threads.html)
- [MessageChannel API](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel)
- [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [Atomics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics)
- [MessagePack](https://github.com/msgpack/msgpack-javascript)
- [Protocol Buffers](https://github.com/protobufjs/protobuf.js)
