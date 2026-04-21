# Semaphore Pattern for Concurrency Control

## Concept

A semaphore is a synchronization primitive that limits the number of concurrent operations. It maintains a counter and allows acquiring/releases of permits to control access to shared resources.

## Why Semaphore?

- **Rate Limiting**: Control API call rates (e.g., max 10 requests/second)
- **Resource Pooling**: Limit database connections, file handles, or worker threads
- **Backpressure**: Prevent overwhelming downstream services
- **Fairness**: Ensure equal access across async operations

## Implementation

### Basic Semaphore

```javascript
class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.current < this.maxConcurrency) {
      this.current++;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      this.current++;
      const next = this.queue.shift();
      next();
    }
  }

  async withLock(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
```

### Weighted Semaphore

Allows acquiring multiple permits at once:

```javascript
class WeightedSemaphore {
  constructor(maxPermits) {
    this.maxPermits = maxPermits;
    this.available = maxPermits;
    this.queue = [];
  }

  async acquire(permits = 1) {
    if (this.available >= permits) {
      this.available -= permits;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push({ permits, resolve });
    });
  }

  release(permits = 1) {
    this.available += permits;

    while (this.queue.length > 0 && this.available >= this.queue[0].permits) {
      const next = this.queue.shift();
      this.available -= next.permits;
      next.resolve();
    }
  }
}
```

## Usage Examples

### Rate-Limited API Client

```javascript
const semaphore = new Semaphore(5); // Max 5 concurrent requests

async function fetchWithLimit(url) {
  return semaphore.withLock(async () => {
    const response = await fetch(url);
    return response.json();
  });
}
```

### Connection Pool

```javascript
const pool = new Semaphore(10); // Max 10 database connections

async function query(sql) {
  return pool.withLock(async () => {
    return db.execute(sql);
  });
}
```

## Testing

Run tests with:
```bash
node --test test/*.test.js
```

## Key Properties

1. **Atomicity**: Counter updates are atomic
2. **FIFO Ordering**: Queued acquires are fulfilled in order (fairness)
3. **Non-preemptive**: Once acquired, a permit is held until explicitly released
4. **Bounded**: Concurrency is always limited by the configured maximum
