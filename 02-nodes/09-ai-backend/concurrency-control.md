# Concurrency Control

## Concept

LLM APIs impose rate limits—RPM (requests-per-minute), TPM (tokens-per-minute), and concurrent connections—that constrain throughput. Concurrency control manages these limits to maximize utilization while avoiding 429 errors and account suspension.

**Architecture Perspective**: Concurrency control is not merely a client-side concern. It spans client libraries, API gateways, and proxy layers. The right implementation depends on where you sit in the stack, your multi-tenant requirements, and whether you prioritize latency, throughput, or cost.

---

## Rate Limit Architecture

### Where to Implement

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CONCURRENCY CONTROL ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │   CLIENT    │    │   GATEWAY   │    │   PROXY     │            │
│  │   EMBEDDED  │───▶│   LAYER     │───▶│   LAYER     │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
│         │                  │                  │                    │
│         ▼                  ▼                  ▼                    │
│  Simple, fast         Centralized        Advanced                  │
│  No shared state      per-provider       per-tenant                │
│  Best: single         Best: multi-app    Best: enterprise          │
│  service              services           scale                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

| Location | Pros | Cons | Best For |
|----------|------|------|----------|
| Client library | Zero network hop, simple | No cross-client coordination | Single service, low traffic |
| API gateway | Centralized, observable | Single point of throttling | Multi-app, shared LLM budget |
| Proxy layer | Per-tenant limits, rich metrics | Additional infrastructure | Enterprise, multi-tenant SaaS |

### Multi-Tenant Considerations

In multi-tenant systems, you need **per-tenant** rate limiting alongside **global** provider limits:

```typescript
interface TenantRateLimitConfig {
  tenantId: string;
  rpmLimit: number;      // Tenant's allocation
  tpmLimit: number;      // Tenant's allocation
  burstAllowance: number; // Temporary overflow
}

class MultiTenantLimiter {
  private globalLimiter: AdaptiveRateLimiter;
  private tenantLimiters: Map<string, TokenBucket>;
  
  constructor(
    private globalConfig: GlobalRateLimitConfig,
    private tenantConfigs: Map<string, TenantRateLimitConfig>
  ) {
    this.globalLimiter = new AdaptiveRateLimiter(
      globalConfig.rpmLimit,
      globalConfig.tpmLimit,
      globalConfig.maxConcurrent
    );
  }
  
  async executeForTenant<T>(
    tenantId: string,
    prompt: string,
    estimatedTokens: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const tenantConfig = this.tenantConfigs.get(tenantId);
    if (!tenantConfig) throw new Error(`Unknown tenant: ${tenantId}`);
    
    // Tenant-level limit (usually stricter than global)
    const tenantLimiter = this.getOrCreateTenantLimiter(tenantId, tenantConfig);
    await tenantLimiter.acquire();
    
    // Global limit (provider API constraints)
    return this.globalLimiter.execute(prompt, estimatedTokens, fn);
  }
}
```

**Trade-off**: Per-tenant limits add latency (extra synchronization) but prevent noisy neighbor problems.

---

## Rate Limit Types

```
┌─────────────────────────────────────────────────────────┐
│                   RATE LIMIT TYPES                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  RPM (Requests Per Minute)                              │
│  ├── Limits HTTP requests                               │
│  ├── Typically 60-3000 depending on tier                │
│  └── Resets every 60 seconds                            │
│                                                         │
│  TPM (Tokens Per Minute)                                │
│  ├── Limits token throughput                            │
│  ├── Usually 60K-1M depending on model/tier            │
│  └── Enforced via token counting in request body       │
│                                                         │
│  Concurrent Connections                                  │
│  ├── Max simultaneous requests                          │
│  ├── Usually 5-50                                       │
│  └── Exceeding causes immediate 429                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Architecture Note**: TPM limits are harder to enforce because token count varies per request. Estimate conservatively and monitor actual consumption via response headers.

---

## Core Algorithms

### Token Bucket Algorithm

Smooth rate limiting that allows burst traffic within capacity.

```typescript
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private capacity: number,      // Max tokens
    private refillRate: number,     // Tokens per second
    private refillInterval = 1000  // Check every second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  async acquire(tokens = 1): Promise<void> {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return;
    }
    
    // Wait for refill
    const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
    await this.delay(waitTime);
    
    this.refill();
    this.tokens -= tokens;
  }
  
  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefill = now;
  }
  
  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  availableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// Usage
const rpmBucket = new TokenBucket(60, 60); // 60 RPM

async function callWithRateLimit(fn: () => Promise<any>) {
  await rpmBucket.acquire();
  return fn();
}
```

**When to use**: Token bucket is ideal for smooth rate limiting with burst allowance. It's computationally cheap and easy to reason about.

### Semaphore for Concurrent Limits

Limits simultaneous operations—critical for connection pool management.

```typescript
class Semaphore {
  private permits: number;
  private waitQueue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];
  
  constructor(permits: number) {
    this.permits = permits;
  }
  
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    
    // Wait for a permit
    return new Promise((resolve, reject) => {
      this.waitQueue.push({ resolve, reject });
    });
  }
  
  release(): void {
    this.permits++;
    
    if (this.waitQueue.length > 0) {
      this.permits--;
      const waiting = this.waitQueue.shift();
      waiting.resolve();
    }
  }
  
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Usage: Max 10 concurrent requests
const concurrentLimiter = new Semaphore(10);

async function callLLM(prompt: string): Promise<string> {
  return concurrentLimiter.withLock(async () => {
    return llm.generate(prompt);
  });
}
```

**When to use**: Semaphores are essential when the upstream has hard concurrent connection limits. They prevent resource exhaustion at the cost of request queuing.

### Priority Queue

Fair ordering with importance levels—essential for production systems with mixed workloads.

```typescript
interface QueuedRequest {
  id: string;
  prompt: string;
  priority: number;  // Higher = more urgent
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  createdAt: Date;
}

class PriorityRequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = 0;
  
  constructor(
    private maxConcurrent: number,
    private rateLimiter: TokenBucket
  ) {}
  
  async enqueue(prompt: string, priority = 0): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: crypto.randomUUID(),
        prompt,
        priority,
        resolve,
        reject,
        createdAt: new Date()
      });
      
      // Sort by priority (descending), then by creation time
      this.queue.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      
      this.process();
    });
  }
  
  private async process() {
    while (this.processing < this.maxConcurrent && this.queue.length > 0) {
      const request = this.queue.shift();
      this.processing++;
      
      try {
        await this.rateLimiter.acquire();
        const result = await llm.generate(request.prompt);
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      } finally {
        this.processing--;
        this.process();
      }
    }
  }
  
  size(): number {
    return this.queue.length;
  }
}
```

**When to use**: Priority queues are critical when you have heterogeneous workloads (e.g., interactive user requests vs. batch processing). They ensure high-priority requests aren't blocked by bulk operations.

---

## Advanced Patterns

### Retry with Exponential Backoff

**Architecture Note**: Retry logic belongs at the call site, not scattered throughout your codebase. Centralize it in a retry handler that applies consistent policies.

```typescript
interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: (string | RegExp)[];
}

class RetryHandler {
  constructor(private config: RetryConfig) {
    this.config = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryableErrors: [/rate.limit/i, /timeout/i, /429/],
      ...config
    };
  }
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (!this.isRetryable(error) || attempt === this.config.maxRetries) {
          throw error;
        }
        
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }
  
  private isRetryable(error: any): boolean {
    const message = error.message || '';
    return this.config.retryableErrors.some(
      pattern => pattern.test(message)
    );
  }
  
  private calculateDelay(attempt: number): number {
    const delay = this.config.initialDelay * 
      Math.pow(this.config.backoffMultiplier, attempt);
    return Math.min(delay, this.config.maxDelay);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Trade-off**: Retries increase tail latency and can exacerbate rate limit pressure during outages. Use with a circuit breaker.

### Circuit Breaker Pattern

Prevent cascading failures when LLM providers are degraded.

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 30000, // 30s
    private halfOpenRequests: number = 3
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure! > this.recoveryTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }
  
  getState() {
    return this.state;
  }
}
```

**Architecture Note**: Circuit breakers work well with adaptive rate limiters. When the breaker opens, the adaptive limiter will reduce throughput, naturally decreasing load on the failing service.

### Adaptive Rate Limiter

Self-tuning based on observed error rates—ideal for production systems.

```typescript
class AdaptiveRateLimiter {
  private rpm: TokenBucket;
  private tpm: TokenBucket;
  private concurrent: Semaphore;
  private successCount = 0;
  private errorCount = 0;
  private lastAdjustment = Date.now();
  
  constructor(
    private rpmLimit: number,
    private tpmLimit: number,
    private maxConcurrent: number
  ) {
    this.rpm = new TokenBucket(rpmLimit, rpmLimit);
    this.tpm = new TokenBucket(tpmLimit, tpmLimit);
    this.concurrent = new Semaphore(maxConcurrent);
  }
  
  async execute<T>(
    prompt: string,
    estimatedTokens: number,
    fn: () => Promise<T>
  ): Promise<T> {
    // Adaptive adjustment every 30 seconds
    this.adjustLimits();
    
    // Acquire all limits
    await Promise.all([
      this.rpm.acquire(),
      this.tpm.acquire(estimatedTokens),
      this.concurrent.acquire()
    ]);
    
    try {
      const result = await fn();
      this.successCount++;
      return result;
    } catch (error) {
      this.errorCount++;
      throw error;
    } finally {
      this.concurrent.release();
    }
  }
  
  private adjustLimits() {
    const now = Date.now();
    if (now - this.lastAdjustment < 30000) return;
    
    const errorRate = this.errorCount / (this.successCount + this.errorCount);
    
    if (errorRate > 0.1) {
      // Too many errors: reduce limits by 20%
      this.rpm.capacity *= 0.8;
      this.tpm.capacity *= 0.8;
      this.maxConcurrent = Math.floor(this.maxConcurrent * 0.8);
    } else if (errorRate < 0.01) {
      // Very successful: increase limits by 10%
      this.rpm.capacity *= 1.1;
      this.tpm.capacity *= 1.1;
      this.maxConcurrent = Math.floor(this.maxConcurrent * 1.1);
    }
    
    this.successCount = 0;
    this.errorCount = 0;
    this.lastAdjustment = now;
  }
}
```

**Trade-off**: Adaptive limiting requires tuning thresholds for your traffic patterns. Aggressive adaptation can cause oscillation; conservative adaptation may not respond fast enough to outages.

---

## Observability

### Metrics to Track

```typescript
interface RateLimitMetrics {
  // Throughput
  requestsPerMinute: number;
  tokensPerMinute: number;
  
  // Health
  errorRate: number;
  circuitBreakerState: string;
  
  // Queue
  queueDepth: number;
  averageWaitTime: number;
  
  // Limits
  utilizedCapacity: number;  // 0-1
  throttledRequests: number;
}

class RateLimitObserver {
  private metrics: RateLimitMetrics;
  
  recordRequest(tokens: number, latency: number, success: boolean) {
    // Update Prometheus metrics or similar
  }
  
  getMetrics(): RateLimitMetrics {
    return this.metrics;
  }
}
```

**Key metrics for alerting**:
- Error rate > 5% sustained for 2 minutes
- Queue depth > 100 for > 5 minutes
- Circuit breaker open

---

## Summary

| Pattern | When to Use | Key Trade-off |
|---------|-------------|---------------|
| Token Bucket | Smooth rate limiting with bursts | Requires token estimation |
| Semaphore | Hard concurrent limits | Queues requests, adds latency |
| Priority Queue | Mixed workload priorities | More complex ordering logic |
| Retry + Backoff | Transient failures | Increases tail latency |
| Circuit Breaker | Prevent cascading failures | May reject valid requests |
| Adaptive Limiter | Production traffic | Requires tuning |

**Architecture Decision Guide**:
1. Single service, low traffic → Token bucket + semaphore
2. Multi-app shared budget → Add API gateway layer
3. Enterprise multi-tenant → Proxy layer with per-tenant limits
4. Mission-critical → Add circuit breaker + adaptive limiter + full observability
