# Concurrency Control

## Concept

LLM APIs have strict rate limits on requests-per-minute (RPM), tokens-per-minute (TPM), and concurrent connections. Concurrency control manages these limits to maximize throughput while avoiding 429 errors and account suspension.

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
│  ├── Usually 60K-1M depending on model/tier              │
│  └── Enforced via token counting in request body        │
│                                                         │
│  Concurrent Connections                                 │
│  ├── Max simultaneous requests                          │
│  ├── Usually 5-50                                       │
│  └── Exceeding causes immediate 429                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Token Bucket Algorithm

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

## Semaphore for Concurrent Limits

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

## Priority Queue

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

## Retry with Exponential Backoff

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

## Adaptive Rate Limiter

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

## Summary

Concurrency control prevents rate limit errors while maximizing throughput:
1. **Token Bucket**: Smooth rate limiting for RPM/TPM
2. **Semaphore**: Limits concurrent connections
3. **Priority Queue**: Fair ordering with importance levels
4. **Retry Handler**: Automatic retry with exponential backoff
5. **Adaptive Limiter**: Self-tuning based on error rates
