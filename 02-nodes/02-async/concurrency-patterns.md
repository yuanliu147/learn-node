# Async Concurrency Patterns

## Overview

Concurrency patterns allow you to manage multiple asynchronous operations effectively. Choosing the right pattern is crucial for performance and correctness.

## Pattern Categories

1. **Sequential** - Run operations one after another
2. **Parallel** - Run operations concurrently
3. **Batched** - Run in groups with concurrency limits
4. **Caching** - Memoize async results
5. **Race** - Use the fastest result

## Sequential Execution

Run tasks one at a time, waiting for each to complete before starting the next.

### With Promises (Chain)

```javascript
async function sequentialPromises(items) {
  const results = [];
  
  for (const item of items) {
    const result = await processItem(item);
    results.push(result);
  }
  
  return results;
}
```

### With reduce

```javascript
function sequentialReduce(items) {
  return items.reduce((promise, item) => {
    return promise.then(results => {
      return processItem(item).then(result => {
        results.push(result);
        return results;
      });
    });
  }, Promise.resolve([]));
}
```

### When to Use

- Operations must run in order
- Each operation depends on the previous one's result
- You need to stop on first error

## Parallel Execution

Run all operations at once without waiting.

### Promise.all()

All must succeed, or first failure wins:

```javascript
async function parallelAll(items) {
  const promises = items.map(item => processItem(item));
  return Promise.all(promises);
}

// Example with actual async operations:
const urls = ['url1', 'url2', 'url3'];
const responses = await Promise.all(
  urls.map(url => fetch(url).then(r => r.json()))
);
```

### Handling Partial Failures with Promise.allSettled()

```javascript
async function parallelWithPartialFailures(items) {
  const results = await Promise.allSettled(
    items.map(item => processItem(item))
  );
  
  return results.map((result, index) => ({
    item: items[index],
    success: result.status === 'fulfilled',
    value: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason : null
  }));
}
```

### When to Use

- Operations are independent
- You need all results
- Failure of one means failure of entire operation

## Batched Execution (Concurrency Limit)

Limit the number of concurrent operations.

### Basic Batching

```javascript
async function processBatch(items, concurrency = 3) {
  const results = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(item => processItem(item))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

### Advanced Batching with Worker Pattern

```javascript
class AsyncBatchProcessor {
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  
  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }
  
  async process() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      this.running++;
      
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.running--;
          this.process();
        });
    }
  }
}

// Usage:
const processor = new AsyncBatchProcessor(3);
const results = await Promise.all([
  processor.add(() => fetch('/api/1')),
  processor.add(() => fetch('/api/2')),
  processor.add(() => fetch('/api/3')),
  processor.add(() => fetch('/api/4')),
  processor.add(() => fetch('/api/5')),
]);
```

## Promise.race()

Return the result of the first settled Promise (fulfillment or rejection).

```javascript
async function raceExample() {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 5000)
  );
  
  const fetchData = fetch('/api/data').then(r => r.json());
  
  return Promise.race([fetchData, timeout]);
}
```

### Use Cases

- Race against a timeout
- Multiple fetch endpoints, use fastest
- Cancel long-running operations

## Promise.any()

Return the first **fulfilled** Promise, ignoring rejections (until all reject).

```javascript
async function anyExample() {
  const endpoints = [
    fetch('https://fast-api.example.com/data'),
    fetch('https://backup-api.example.com/data'),
    fetch('https://alternate-api.example.com/data')
  ];
  
  // Returns first successful response
  return Promise.any(endpoints);
}
```

### Handling All Rejected

```javascript
try {
  const result = await Promise.any(failingPromises);
} catch (error) {
  console.log('All failed:', error.errors);
  // error.errors contains all individual errors
}
```

## Memoization / Caching

Cache async function results to avoid redundant calls.

### Simple Memoize

```javascript
function memoize(asyncFn) {
  const cache = new Map();
  
  return async (...args) => {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = await asyncFn(...args);
    cache.set(key, result);
    return result;
  };
}

// Usage:
const fetchUserMemo = memoize(fetchUser);
fetchUserMemo(1); // First call - actual fetch
fetchUserMemo(1); // Second call - returns cached Promise
```

### TTL Cache (Time-to-Live)

```javascript
class MemoizedAsync {
  constructor(fn, ttlMs = 60000) {
    this.fn = fn;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }
  
  async get(...args) {
    const key = JSON.stringify(args);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return cached.value;
    }
    
    const value = await this.fn(...args);
    this.cache.set(key, { value, timestamp: Date.now() });
    return value;
  }
}
```

## Retry Pattern

Retry failed operations with exponential backoff.

### Basic Retry

```javascript
async function retry(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    
    await new Promise(r => setTimeout(r, delay));
    return retry(fn, retries - 1, delay * 2); // Exponential backoff
  }
}
```

### Retry with Jitter

```javascript
async function retryWithJitter(fn, retries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      
      // Random jitter: baseDelay * 2^attempt ± random
      const jitter = Math.random() * 100;
      const delay = baseDelay * Math.pow(2, attempt) + jitter;
      
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

### Retry Only On Specific Errors

```javascript
async function retryOnNetworkError(fn, retries = 3) {
  const NETWORK_ERRORS = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      
      const isNetworkError = NETWORK_ERRORS.some(
        e => error.message?.includes(e) || error.code === e
      );
      
      if (!isNetworkError) throw error; // Don't retry non-network errors
      
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
```

## Circuit Breaker Pattern

Prevent cascading failures by "opening" after too many failures.

```javascript
class CircuitBreaker {
  constructor(fn, options = {}) {
    this.fn = fn;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    
    this.failures = 0;
    this.lastFailure = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }
  
  async execute(...args) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await this.fn(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }
  
  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  onFailure(error) {
    this.failures++;
    this.lastFailure = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

## Debounce and Throttle

### Debounce

Wait for a pause before executing:

```javascript
function debounce(fn, delay) {
  let timeoutId;
  
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Usage: Search input
const debouncedSearch = debounce((query) => {
  fetchResults(query);
}, 300);
```

### Throttle

Execute at most once per interval:

```javascript
function throttle(fn, limit) {
  let inThrottle = false;
  
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Usage: Scroll handler
const throttledScroll = throttle(() => {
  console.log('Scrolled!');
}, 100);
```

## Async Queue Pattern

Process tasks with controlled concurrency:

```javascript
class AsyncQueue {
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  
  add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }
  
  process() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();
      this.running++;
      
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.running--;
          this.process();
        });
    }
  }
}
```

## Semaphore Pattern

Limit concurrent access to resources:

```javascript
class Semaphore {
  constructor(count) {
    this.count = count;
    this.waiters = [];
  }
  
  async acquire() {
    if (this.count > 0) {
      this.count--;
      return;
    }
    
    return new Promise(resolve => {
      this.waiters.push(resolve);
    });
  }
  
  release() {
    this.count++;
    
    if (this.waiters.length > 0) {
      this.count--;
      const resolve = this.waiters.shift();
      resolve();
    }
  }
  
  async use(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Usage:
const semaphore = new Semaphore(3); // Max 3 concurrent

async function limitedTask() {
  return semaphore.use(() => performHeavyTask());
}
```

## Summary Table

| Pattern | Use Case | Key Feature |
|---------|----------|-------------|
| Sequential | Dependent operations | Order guaranteed |
| Promise.all | Independent operations | All must succeed |
| Promise.allSettled | Independent operations | Partial success OK |
| Promise.race | Timeout, fastest wins | First to settle wins |
| Promise.any | Fastest success | First to fulfill wins |
| Batching | Many operations | Limits concurrency |
| Memoize | Repeated calls | Caches results |
| Retry | Unreliable services | Handles transient failures |
| Circuit Breaker | External services | Prevents cascade |
| Debounce | User input | Waits for pause |
| Throttle | Events | Rate limits |
| Semaphore | Resource limits | Max concurrent |

## Choosing the Right Pattern

1. **Independent tasks** → Promise.all
2. **Need all results even on failure** → Promise.allSettled
3. **Many tasks, limit resources** → Batching or Semaphore
4. **Same call multiple times** → Memoization
5. **Unreliable service** → Retry with backoff
3. **External API calls** → Circuit Breaker
5. **User-triggered events** → Debounce/Throttle
