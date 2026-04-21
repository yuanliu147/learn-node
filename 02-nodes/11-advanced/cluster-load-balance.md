---
title: "Cluster Module and Load Balancing"
description: "Node.js cluster module for utilizing multi-core systems, load balancing strategies, and high-availability setups"
tags:
  - nodejs
  - cluster
  - load-balancing
  - multi-core
  - scalability
  - performance
related:
  - ipc-serialization
  - event-loop-phases
  - node-startup-flow
---

# Cluster Module and Load Balancing

Node.js runs in a single-threaded event loop, which means a single process can only use one CPU core. The **cluster module** enables spreading the load across multiple processes, each running its own event loop, to fully utilize multi-core systems.

## Why Node.js Needs Clustering

```
┌─────────────────────────────────────────────────────────────────┐
│              Single Process Limitations                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Process (single-threaded)                                     │
│   ┌─────────────────────────────────────┐                      │
│   │                                     │                      │
│   │   Event Loop                        │                      │
│   │   ┌─────────────────────────────┐   │                      │
│   │   │  CPU Core 1 (100%)         │   │  ← Only 1 core used  │
│   │   └─────────────────────────────┘   │                      │
│   │   CPU Cores 2-7: Idle               │                      │
│   │                                     │                      │
│   └─────────────────────────────────────┘                      │
│                                                                 │
│   On 8-core system: 87.5% of CPU wasted!                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Cluster Module Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cluster Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                         Master Process                          │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  - Listens on port                                      │  │
│   │  - Accepts connections                                  │  │
│   │  - Distributes to workers (load balancer)              │  │
│   │  - Manages worker lifecycle                            │  │
│   └─────────────────────────────────────────────────────────┘  │
│                              │                                   │
│          ┌───────────────────┼───────────────────┐              │
│          │                   │                   │              │
│          ▼                   ▼                   ▼              │
│   ┌────────────┐       ┌────────────┐       ┌────────────┐      │
│   │  Worker 1  │       │  Worker 2  │       │  Worker N  │      │
│   │  (PID 123) │       │  (PID 456) │       │  (PID 789) │      │
│   │            │       │            │       │            │      │
│   │  Event     │       │  Event     │       │  Event     │      │
│   │  Loop      │       │  Loop      │       │  Loop      │      │
│   │            │       │            │       │            │      │
│   │  Handles   │       │  Handles   │       │  Handles   │      │
│   │  subset    │       │  subset    │       │  subset    │      │
│   └────────────┘       └────────────┘       └────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Basic Cluster Usage

### Simple Round-Robin Cluster

```javascript
const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);
    
    // Fork workers for each CPU
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    // Listen for worker exit events
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        // Optionally restart the worker
        cluster.fork();
    });
    
} else {
    // Worker process - HTTP server
    http.createServer((req, res) => {
        res.writeHead(200);
        res.end(`Handled by worker ${process.pid}\n`);
    }).listen(8000);
    
    console.log(`Worker ${process.pid} started`);
}
```

### Using cluster.isPrimary (Node.js 16+)

```javascript
const cluster = require('cluster');
const http = require('http');

if (cluster.isPrimary) {
    // isPrimary is true for the master process
    const numCPUs = require('os').cpus().length;
    
    console.log(`Primary ${process.pid} spawning ${numCPUs} workers`);
    
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} exited`);
        // Restart on exit
        cluster.fork();
    });
    
} else {
    // Worker process
    http.createServer((req, res) => {
        res.end(`Response from ${process.pid}`);
    }).listen(3000);
}
```

## Load Balancing Strategies

### 1. Round Robin (Default - Linux/macOS)

The master distributes connections in rotation:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Round Robin Distribution                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Connection 1 ──► Worker 1                                     │
│   Connection 2 ──► Worker 2                                     │
│   Connection 3 ──► Worker 3                                     │
│   Connection 4 ──► Worker 1                                     │
│   Connection 5 ──► Worker 2                                     │
│   ...                                                           │
│                                                                 │
│   OS: Linux, macOS                                              │
│   Method: OS-level load balancing (SO_REUSEPORT)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Shared Socket Load Balancing (Windows)

On Windows, Node.js uses `SCHED_ROUND_ROBIN`:

```javascript
// Force round-robin on all platforms
cluster.schedulingPolicy = cluster.SCHED_RR;

// Disable cluster (use single process)
cluster.schedulingPolicy = cluster.SCHED_NONE;
```

### 3. Custom Load Balancing via IPC

```javascript
// master.js
const cluster = require('cluster');
const http = require('http');

if (cluster.isPrimary) {
    // Custom load tracking
    const workers = new Map();
    let currentIndex = 0;
    
    // Track worker load
    function updateLoad(workerId, load) {
        workers.set(workerId, load);
    }
    
    // Custom "least connections" balancer
    function getLeastLoadedWorker() {
        let minLoad = Infinity;
        let selected = null;
        
        for (const [id, load] of workers) {
            if (load < minLoad) {
                minLoad = load;
                selected = id;
            }
        }
        return selected;
    }
    
    // Fork workers
    for (let i = 0; i < 4; i++) {
        const worker = cluster.fork();
        workers.set(worker.id, 0);
        
        // Receive load updates from workers
        worker.on('message', (msg) => {
            if (msg.type === 'load') {
                updateLoad(worker.id, msg.load);
            }
        });
    }
    
} else {
    // Worker with custom load reporting
    const server = http.createServer((req, res) => {
        // Track active requests
        process.send({ type: 'load', load: currentLoad });
        res.end('ok');
    });
    
    let currentLoad = 0;
    
    server.on('connection', () => {
        currentLoad++;
    });
    
    server.on('close', () => {
        currentLoad--;
    });
    
    server.listen(3000);
}
```

## Connection Handling

### How Connections Are Distributed

```
┌─────────────────────────────────────────────────────────────────┐
│              Connection Distribution Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Client                                                         │
│      │                                                          │
│      │ TCP SYN                                                  │
│      ▼                                                          │
│   Master Process (listening socket)                             │
│      │                                                          │
│      │ On Linux with SO_REUSEPORT:                              │
│      │ - OS distributes directly to worker                     │
│      │ - Master may not be involved after initial connection   │
│      │                                                          │
│      │ On Windows or without SO_REUSEPORT:                     │
│      │ - Master accepts connection                             │
│      │ - Master passes socket to worker via IPC                │
│      │                                                          │
│      ▼                                                          │
│   Worker Process                                                │
│      │                                                          │
│      │ Handles HTTP request                                    │
│      │                                                          │
└─────────────────────────────────────────────────────────────────┘
```

### Handling Connection Close

```javascript
// Worker - tracking connections
const cluster = require('cluster');
const http = require('http');

if (cluster.isPrimary) {
    const numCPUs = require('os').cpus().length;
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
} else {
    const server = http.createServer((req, res) => {
        // Simulate work
        setTimeout(() => {
            res.writeHead(200);
            res.end(`Worker ${process.pid} handled request`);
        }, 100);
    });
    
    server.listen(8000, () => {
        console.log(`Worker ${process.pid} listening on 8000`);
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
        console.log(`Worker ${process.pid} received SIGTERM`);
        server.close(() => {
            console.log(`Worker ${process.pid} closed connections`);
            process.exit(0);
        });
    });
}
```

## Inter-Process Communication (IPC)

Workers communicate with the master via IPC channels:

```javascript
// Master - sending messages to workers
if (cluster.isPrimary) {
    const worker = cluster.fork();
    
    // Send message to specific worker
    worker.send({ type: 'command', action: 'reload' });
    
    // Receive message from worker
    worker.on('message', (msg) => {
        if (msg.type === 'status') {
            console.log(`Worker ${worker.id} status:`, msg.data);
        }
    });
    
    // Broadcast to all workers
    for (const id in cluster.workers) {
        cluster.workers[id].send({ type: 'broadcast', data: 'hello' });
    }
    
} else {
    // Worker - receiving messages
    process.on('message', (msg) => {
        if (msg.type === 'command') {
            if (msg.action === 'reload') {
                // Reload configuration
                reloadConfig();
            }
        }
    });
    
    // Send message to master
    process.send({ type: 'status', data: { pid: process.pid, uptime: process.uptime() } });
}
```

## Process Lifecycle Management

### Starting Workers

```javascript
const cluster = require('cluster');
const http = require('http');

if (cluster.isPrimary) {
    // Environment variables passed to workers
    const env = { ...process.env, WORKER_ID: '1' };
    
    // Start worker with custom environment
    const worker = cluster.fork({ WORKER_TYPE: 'http' });
    
    // Different worker types
    const httpWorker = cluster.fork({ WORKER_TYPE: 'api' });
    const bgWorker = cluster.fork({ WORKER_TYPE: 'background' });
    
} else {
    console.log(`Worker type: ${process.env.WORKER_TYPE}`);
}
```

### Worker Events

```javascript
if (cluster.isPrimary) {
    cluster.on('fork', (worker) => {
        console.log(`Forking worker ${worker.id}`);
    });
    
    cluster.on('online', (worker) => {
        console.log(`Worker ${worker.id} is online and running`);
    });
    
    cluster.on('listening', (worker, address) => {
        console.log(`Worker ${worker.id} is listening on ${address.address}:${address.port}`);
    });
    
    cluster.on('disconnect', (worker) => {
        console.log(`Worker ${worker.id} disconnected`);
    });
    
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.id} exited with code ${code}, signal ${signal}`);
        
        // Don't restart if explicitly killed
        if (worker.exitedAfterDisconnect) {
            console.log('Worker was intentionally killed');
        } else {
            // Unexpected death - restart
            console.log('Restarting worker...');
            cluster.fork();
        }
    });
    
    cluster.on('error', (worker, error) => {
        console.error(`Worker ${worker.id} error:`, error);
    });
}
```

## Zero-Downtime Deployment

### Graceful Shutdown and Restart

```javascript
const cluster = require('cluster');
const http = require('http');

let isShuttingDown = false;

if (cluster.isPrimary) {
    const numCPUs = require('os').cpus().length;
    
    function spawnWorker() {
        const worker = cluster.fork();
        console.log(`Spawned worker ${worker.id}`);
        return worker;
    }
    
    // Initial workers
    for (let i = 0; i < numCPUs; i++) {
        spawnWorker();
    }
    
    // Handle SIGINT/SIGTERM for graceful shutdown
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    // Handle worker exit - respawn unless shutting down
    cluster.on('exit', (worker) => {
        if (!isShuttingDown) {
            console.log(`Worker ${worker.id} died, respawning...`);
            spawnWorker();
        }
    });
    
    function gracefulShutdown() {
        console.log('Received shutdown signal');
        isShuttingDown = true;
        
        // Stop accepting new connections
        cluster.disconnect(() => {
            console.log('All workers disconnected');
            process.exit(0);
        });
    }
    
} else {
    const server = http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200);
            res.end('OK');
            return;
        }
        
        // Handle request
        res.writeHead(200);
        res.end(`Handled by ${process.pid}`);
    });
    
    server.listen(3000);
    
    // Handle shutdown signal
    process.on('SIGTERM', () => {
        console.log(`Worker ${process.pid} shutting down`);
        
        // Stop accepting new connections
        server.close(() => {
            console.log(`Worker ${process.pid} closed`);
            process.exit(0);
        });
        
        // Force exit after 30 seconds
        setTimeout(() => {
            console.error(`Worker ${process.pid} force exit`);
            process.exit(1);
        }, 30000);
    });
}
```

## Advanced Patterns

### Sticky Sessions

Maintain client requests to the same worker:

```javascript
const cluster = require('cluster');
const http = require('http');

if (cluster.isPrimary) {
    const workers = {};
    const numCPUs = require('os').cpus().length;
    
    // Assign worker based on client IP (simple hash)
    function getWorkerForClient(ip) {
        // Simple consistent hashing
        const hash = ip.split('.').reduce((acc, octet) => acc + parseInt(octet), 0);
        const index = hash % numCPUs;
        const workerIds = Object.keys(cluster.workers);
        return cluster.workers[workerIds[index]];
    }
    
    // Start all workers
    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster.fork();
        workers[worker.id] = { ip: null, connections: 0 };
    }
    
    // Handle HTTP proxy manually (for sticky sessions)
    const net = require('net');
    const server = net.createServer((socket) => {
        const clientIP = socket.remoteAddress;
        const worker = getWorkerForClient(clientIP);
        
        // Forward to specific worker
        worker.send('sticky-session', socket);
    });
    
    server.listen(8000);
    
} else {
    const http = require('http');
    const server = http.createServer((req, res) => {
        res.end(`Worker ${process.pid}\n`);
    });
    
    // Listen on random port (worker will receive connections via IPC)
    server.listen(0);  // Port 0 = random port
    
    process.on('message', (msg, socket) => {
        if (msg === 'sticky-session' && socket) {
            // Handle the connection
            server._handleConnection(socket);
        }
    });
}
```

### Worker Management

```javascript
// Dedicated worker types
const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;

if (cluster.isPrimary) {
    // HTTP workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({ WORKER_TYPE: 'http' });
    }
    
    // Background workers (no HTTP, just message processing)
    for (let i = 0; i < 2; i++) {
        cluster.fork({ WORKER_TYPE: 'background' });
    }
    
} else {
    const workerType = process.env.WORKER_TYPE;
    
    if (workerType === 'http') {
        http.createServer((req, res) => {
            res.end('HTTP response');
        }).listen(3000);
    } else if (workerType === 'background') {
        // Background job processor
        process.on('message', (msg) => {
            if (msg.type === 'job') {
                processJob(msg.data);
            }
        });
        
        // Notify master we're ready
        process.send({ type: 'ready', pid: process.pid });
    }
}
```

## Monitoring and Debugging

### Worker Status Monitoring

```javascript
const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
    // Monitor workers
    setInterval(() => {
        const workers = Object.values(cluster.workers);
        
        console.log(`\n=== Cluster Status (${new Date().toISOString()}) ===`);
        console.log(`CPU cores: ${os.cpus().length}`);
        console.log(`Online workers: ${workers.length}`);
        
        workers.forEach(worker => {
            const memUsage = worker.process.memoryUsage();
            console.log(`  Worker ${worker.id}:`);
            console.log(`    PID: ${worker.process.pid}`);
            console.log(`    Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
            console.log(`    Uptime: ${Math.round(worker.uptime())}s`);
        });
    }, 10000);  // Every 10 seconds
    
} else {
    // Worker code
}
```

### Debugging Workers

```bash
# Debug specific worker (Node.js debugging)
node --inspect=0.0.0.0:9229 worker.js

# Debug with worker ID
CLUSTER_WORKER_ID=1 node --inspect worker.js

# List workers
ps aux | grep 'node.*worker'
```

## Common Pitfalls

### 1. Shared State Without IPC

```javascript
// WRONG: Workers sharing in-memory state
if (cluster.isPrimary) {
    // Master has state
    global.cache = {};
} else {
    // Workers have separate caches - cache not shared!
}

// CORRECT: Use Redis or similar for shared state
const redis = require('redis');
const client = redis.createClient();
```

### 2. Not Handling Worker Death

```javascript
// WRONG: No respawn strategy
if (cluster.isPrimary) {
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    // Workers die and never come back!
}

// CORRECT: Handle worker death
cluster.on('exit', (worker) => {
    console.log(`Worker died, respawning`);
    cluster.fork();
});
```

### 3. Port Conflicts

```javascript
// WRONG: Each worker tries to bind same port directly
// Without cluster coordination, all workers fail

// CORRECT: Use cluster's built-in sharing
if (cluster.isPrimary) {
    // Master handles port sharing
    cluster.fork();
} else {
    server.listen(8000);  // Cluster module coordinates
}
```

## Key Takeaways

1. **Node.js is single-threaded** - the cluster module enables multi-process scaling
2. **Master handles load distribution** - workers handle actual request processing
3. **IPC is essential** - use `process.send()` / `process.on('message')` for communication
4. **Load balancing varies by OS** - Linux uses SO_REUSEPORT, Windows uses round-robin
5. **Graceful shutdown requires coordination** - signal workers, drain connections, then exit
6. **Workers are independent** - no shared memory, use external stores for shared state

## References

- [Node.js Cluster Module](https://nodejs.org/api/cluster.html)
- [Node.js Load Balancing](https://nodejs.org/api/cluster.html#cluster_how_it_works)
- [SO_REUSEPORT Load Balancing](https://www.nginx.com/blog/socket-sharding-nginx/)
- [Graceful Shutdown Patterns](https://github.com/goldbergyoni/nodebestpractices)
