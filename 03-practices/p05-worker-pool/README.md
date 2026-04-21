# Worker Pool (p05)

A thread pool implementation demonstrating worker_threads for CPU-intensive tasks in Node.js.

## Overview

This project demonstrates:
- Creating a pool of worker threads
- Distributing tasks across workers
- Handling results and errors from workers
- Graceful pool shutdown

## Quick Start

```bash
npm install
npm test
```

## Project Structure

```
├── src/
│   ├── index.js          # Main entry point
│   ├── pool.js           # Worker pool implementation
│   ├── worker.js         # Worker thread logic
│   └── tasks.js          # Task definitions
└── test/
    └── pool.test.js      # Unit tests
```

## Usage

```javascript
const { WorkerPool } = require('./src/pool');

// Create pool with 4 workers
const pool = new WorkerPool(4);

// Submit tasks
pool.runTask({ type: 'compute', data: 42 })
  .then(result => console.log(result))
  .catch(err => console.error(err));

// Shutdown when done
await pool.shutdown();
```

## License

MIT
