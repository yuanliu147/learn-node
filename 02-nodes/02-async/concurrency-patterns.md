# Async Concurrency Patterns: Architecture Decision Guide

## Overview

Selecting the right concurrency pattern is an architectural decision with lasting implications for performance, resource utilization, and system resilience. The wrong choice can cause throughput bottlenecks, resource exhaustion, or cascading failures.

**Decision Framework:**
- Are operations **dependent** (require ordering) or **independent**?
- What is your **failure tolerance** (all-must-succeed vs. partial-ok)?
- Are you managing **finite resources** (API rate limits, connections)?
- What are the **latency vs. throughput** requirements?

---

## 1. Sequential Execution

### When to Use
- Operations have **data dependencies** between steps
- You need **atomic ordering** for correctness (e.g., read-then-write sequences)
- Failure at any step should **fail the entire pipeline**
- Debugging requires **predictable execution order**

### Trade-offs
| Pros | Cons |
|------|------|
| Simple to reason about | No parallelism = highest latency |
| Guaranteed ordering | Cannot exploit multi-core |
| Easy debugging | Poor throughput for independent tasks |

### Implementation

```javascript
// Simple loop-based sequential
async function sequentialPromises(items) {
  const results = [];
  for (const item of items) {
    results.push(await processItem(item));
  }
  return results;
}

// reduce-based chain (Promise pipelining)
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

### Anti-pattern Warning
Sequential is often used by default when parallel would be correct. If operations are independent, parallelize them.

---

## 2. Parallel Execution (Promise.all)

### When to Use
- Operations are **completely independent**
- You need **all results** to proceed
- **All-or-nothing** failure semantics are acceptable
- Latency is critical and you can parallelize

### Trade-offs
| Pros | Cons |
|------|------|
| Minimum total latency | One failure = total failure |
| Maximizes throughput | No result until slowest completes |
| Simple mental model | Memory pressure with many tasks |

### Implementation

```javascript
// Basic parallel - all must succeed
async function parallelAll(items) {
  return Promise.all(items.map(item => processItem(item)));
}

// With error handling - graceful degradation
async function parallelAllGraceful(items) {
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

### Selection Criteria
- Use `Promise.all` when: failure is unacceptable, results are needed together
- Use `Promise.allSettled` when: partial success is acceptable, you need all outcomes

---

## 3. Batched Execution (Concurrency Limits)

### When to Use
- **High-volume operations** that could overwhelm resources
- External APIs with **rate limits** (e.g., 100 requests/minute)
- Database connections with **pool size limits**
- Tasks that are **CPU/memory intensive**
- You need **predictable resource consumption**

### Trade-offs
| Pros | Cons |
|------|------|
| Controls resource usage | More complex implementation |
| Survives rate-limited APIs | Lower total throughput than unlimited parallel |
| Prevents memory exhaustion | Tuning concurrency required |
| Predictable performance | Batch size affects latency |

### Implementation

```javascript
// Fixed batch processing
async function processBatch(items, concurrency = 10) {
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

// Dynamic worker queue - recommended for production
class AsyncBatchProcessor {
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  
  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }
  
  process() {
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

// Usage
const processor = new AsyncBatchProcessor(10);
const results = await Promise.all([
  processor.add(() => fetch('/api/1')),
  processor.add(() => fetch('/api/2')),
  processor.add(() => fetch('/api/3')),
]);
```

### Tuning Guide
- Start with `concurrency = (rate_limit / expected_response_time) * 0.8`
- Monitor for 429 (Too Many Requests) errors
- Increase if you see underutilization; decrease on failures

---

## 4. Promise.race() - First to Settle

### When to Use
- **Timeout enforcement** on long-running operations
- **Fallback to backup** services
- **Cancelation semantics** (race against cancel signal)
- Getting fastest response from **multiple equivalent endpoints**

### Trade-offs
| Pros | Cons |
|------|------|
| Prevents indefinite hanging | Winner may be a failure |
| Enables fallback chains | Unpredictable which completes first |
| Simple cancelation pattern | May waste resources on slow losers |

### Implementation

```javascript
// Timeout pattern
async function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), ms)
  );
  return Promise.race([promise, timeout]);
}

// Fastest endpoint pattern
async function fastestEndpoint() {
  const endpoints = [
    fetch('https://primary.example.com/data'),
    fetch('https://secondary.example.com/data'),
  ];
  
  return Promise.race(endpoints);
}
```

### Important
`Promise.race` returns when **any** promise settles (fulfill or reject). Use `Promise.any` if you only care about the first successful result.

---

## 5. Promise.any() - First to Fulfill

### When to Use
- You want **any successful response** from multiple sources
- Redundant services that provide the same capability
- Latency-critical paths where **speed matters more than source**

### Trade-offs
| Pros | Cons |
|------|------|
| Minimizes perceived latency | Ignores failures until all fail |
| Tries all sources automatically | All errors aggregated, not first |
| No cascade if one source fails | May mask underlying issues |

### Implementation

```javascript
async function anySuccessful(endpoints) {
  return Promise.any(endpoints.map(url => fetch(url).then(r => r.json())));
}

// Error handling - all sources failed
try {
  const result = await Promise.any(failingPromises);
} catch (error) {
  console.log('All failed:', error.errors);
  // error.errors contains all individual rejections
}
```

---

## 6. Memoization / Caching

### When to Use
- **Expensive operations** called repeatedly with same arguments
- **Read-heavy** workloads with infrequent updates
- **Idempotent operations** where freshness isn't critical
- Reducing API calls to stay within rate limits

### Trade-offs
| Pros | Cons |
|------|------|
| Eliminates redundant work | Memory grows unbounded without limits |
| Reduces API costs | Stale data risk |
| Improves latency | Cache invalidation complexity |

### Implementation

```javascript
// Simple memoization
function memoize(asyncFn) {
  const cache = new Map();
  
  return async (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    
    const result = await asyncFn(...args);
    cache.set(key, result);
    return result;
  };
}

// TTL-based cache - recommended for production
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

// Usage
const fetchUserMemo = new MemoizedAsync(fetchUser, 30000);
```

### Cache Invalidation Strategies
- **TTL**: Time-based expiration (shown above)
- **LRU**: Evict least-recently-used when size limit reached
- **Manual**: Expose `invalidate(key)` method
- **Event-driven**: Invalidate on write operations

---

## 7. Retry Pattern

### When to Use
- **Transient failures** (network hiccups, temporary overload)
- Operations against **eventually-consistent systems**
- **Idempotent operations** where retry is safe
- Services known to have **intermittent availability**

### Trade-offs
| Pros | Cons |
|------|------|
| Handles transient failures gracefully | Can worsen overload (thundering herd) |
| Improves success rate | Latency increases on failure |
| Simple to implement | May mask systemic issues |

### Implementation

```javascript
// Basic retry with exponential backoff
async function retry(fn, retries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }
}

// Retry with jitter - prevents thundering herd
async function retryWithJitter(fn, retries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      const jitter = Math.random() * 100;
      const delay = baseDelay * Math.pow(2, attempt) + jitter;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Selective retry - network errors only
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
      
      if (!isNetworkError) throw error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
```

### Anti-pattern Warning
Never retry on validation errors, authentication failures, or 4xx responses. Only retry on transient 5xx errors and network failures.

---

## 8. Circuit Breaker Pattern

### When to Use
- Calling **external/unreliable services**
- Preventing **cascading failures** in microservice architectures
- Systems where **fail-fast** is better than hanging
- Protecting against **resource exhaustion** from repeated failures

### Trade-offs
| Pros | Cons |
|------|------|
| Prevents cascade failures | Adds architectural complexity |
| Gives failing services time to recover | May prematurely reject valid requests |
| Provides observability into service health | Requires tuning thresholds |

### Implementation

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
        throw new Error('Circuit breaker is OPEN - service unavailable');
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

### State Machine
```
CLOSED → (failure threshold reached) → OPEN
OPEN → (reset timeout elapsed) → HALF_OPEN
HALF_OPEN → (success) → CLOSED
HALF_OPEN → (failure) → OPEN
```

---

## 9. Debounce and Throttle

### When to Use

| Pattern | Use Case | Behavior |
|---------|----------|----------|
| **Debounce** | Search input, form validation | Waits for **pause** before executing |
| **Throttle** | Scroll handlers, resize events | Executes at **fixed interval** regardless of frequency |

### Trade-offs
| Aspect | Debounce | Throttle |
|--------|----------|----------|
| Latency | Higher (waits for pause) | Lower (immediate, then rate-limited) |
| Server load | Lower | Lower (but may be higher than needed) |
| User experience | May feel slow | More responsive |

### Implementation

```javascript
// Debounce - waits for silence
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

const debouncedSearch = debounce((query) => {
  fetchResults(query);
}, 300);

// Throttle - fixed rate
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

const throttledScroll = throttle(() => {
  handleScroll();
}, 100);
```

---

## 10. Semaphore Pattern

### When to Use
- **Strict concurrency limits** (not just batches)
- Limiting **parallel database queries**
- Controlling **parallel file operations**
- Any scenario where you need to **acquire/release** resources explicitly

### Trade-offs
| Pros | Cons |
|------|------|
| Fine-grained control | More complex than simple batching |
| Can limit heterogeneous operations | Manual acquire/release required |
| Useful for weighted resources | Easy to leak if not properly released |

### Implementation

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
      this.waiters.shift()();
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

// Usage - limit to 3 concurrent heavy operations
const semaphore = new Semaphore(3);

async function limitedTask() {
  return semaphore.use(() => performHeavyTask());
}
```

---

## 11. Async Queue Pattern

### When to Use
- **Job processing systems** with priority support
- When you need **dynamic concurrency** adjustment
- **Backpressure** handling (slow consumers vs fast producers)
- Building **workflow engines**

### Implementation

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
  
  // Pause processing
  pause() {
    this.concurrency = 0;
  }
  
  // Resume with new limit
  resume(concurrency = 1) {
    this.concurrency = concurrency;
    this.process();
  }
}
```

---

## Decision Matrix

| Requirement | Recommended Pattern | Alternative |
|-------------|-------------------|-------------|
| Independent parallel tasks | `Promise.all` | `Promise.allSettled` |
| Rate-limited API | `AsyncBatchProcessor` | `Semaphore` |
| Same result multiple times | `MemoizedAsync` | HTTP cache |
| Timeout on slow operation | `Promise.race` | `retry` + `timeout` |
| Fastest successful response | `Promise.any` | Custom race logic |
| Transient failures | `retry` + jitter | Circuit Breaker |
| Cascading failure protection | `CircuitBreaker` | Bulkhead pattern |
| User input optimization | `debounce` / `throttle` | - |
| Resource acquisition | `Semaphore` | `AsyncQueue` |
| Ordered dependencies | Sequential | `reduce` chain |

---

## Anti-Patterns to Avoid

1. **Sequential when parallel**: Using `for`/`await` loop for independent operations
2. **No retry on network errors**: Blindly failing on transient failures
3. **Unbounded Promise.all**: Creating thousands of parallel tasks
4. **No timeout on external calls**: Allowing indefinite hangs
5. **Retry on 4xx errors**: Retrying validation/auth failures
6. **Memoization without limits**: Memory leak from unbounded cache
7. **Circuit breaker too sensitive**: Opening on occasional hiccups

---

## Pattern Composition

Patterns compose for complex scenarios:

```javascript
// Production-ready external API call
class RobustApiClient {
  constructor(url) {
    this.url = url;
    this.circuitBreaker = new CircuitBreaker(fetch, {
      failureThreshold: 5,
      resetTimeout: 30000
    });
  }
  
  async fetchWithRetry(path, retries = 3) {
    return retryWithJitter(
      () => this.circuitBreaker.execute(`${this.url}${path}`),
      retries
    );
  }
}
```
