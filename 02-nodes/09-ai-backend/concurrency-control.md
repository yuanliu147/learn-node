# 并发控制

## 概念

LLM API 施加速率限制——RPM（每分钟请求数）、TPM（每分钟令牌数）和并发连接——这些约束了吞吐量。并发控制管理这些限制，以最大化利用率同时避免 429 错误和账户暂停。

**架构视角**：并发控制不仅仅是客户端关注的问题。它涉及客户端库、API 网关和代理层。正确的实现取决于你所处的技术栈位置、多租户需求，以及你对延迟、吞吐量或成本的优先级。

---

## 速率限制架构

### 在哪里实现

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

| 位置 | 优点 | 缺点 | 适用于 |
|----------|------|------|----------|
| 客户端库 | 零网络延迟，简单 | 无跨客户端协调 | 单服务，低流量 |
| API 网关 | 集中化，可观测 | 单一限流点 | 多应用，共享 LLM 预算 |
| 代理层 | 每租户限制，丰富的指标 | 额外基础设施 | 企业级，多租户 SaaS |

### 多租户注意事项

在多租户系统中，你需要**每租户**速率限制以及**全局**提供商限制：

```typescript
interface TenantRateLimitConfig {
  tenantId: string;
  rpmLimit: number;      // 租户的配额
  tpmLimit: number;      // 租户的配额
  burstAllowance: number; // 临时溢出
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
    
    // 租户级别限制（通常比全局更严格）
    const tenantLimiter = this.getOrCreateTenantLimiter(tenantId, tenantConfig);
    await tenantLimiter.acquire();
    
    // 全局限制（提供商 API 约束）
    return this.globalLimiter.execute(prompt, estimatedTokens, fn);
  }
}
```

**权衡**：每租户限制增加延迟（额外的同步）但可以防止"噪声邻居"问题。

---

## 速率限制类型

```
┌─────────────────────────────────────────────────────────┐
│                   RATE LIMIT TYPES                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  RPM (Requests Per Minute)                              │
│  ├── 限制 HTTP 请求                                     │
│  ├── 通常根据套餐不同为 60-3000                          │
│  └── 每 60 秒重置                                       │
│                                                         │
│  TPM (Tokens Per Minute)                                │
│  ├── 限制令牌吞吐量                                     │
│  ├── 通常根据模型/套餐不同为 60K-1M                     │
│  └── 通过请求体中的令牌计数强制执行                      │
│                                                         │
│  Concurrent Connections                                  │
│  ├── 最大同时请求数                                      │
│  ├── 通常为 5-50                                        │
│  └── 超过会立即导致 429                                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**架构注意**：TPM 限制更难强制执行，因为令牌计数因请求而异。保守估算并通过响应头监控实际消耗。

---

## 核心算法

### 令牌桶算法

允许突发流量在容量范围内的平滑速率限制。

```typescript
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private capacity: number,      // 最大令牌数
    private refillRate: number,     // 每秒令牌数
    private refillInterval = 1000  // 每秒检查一次
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
    
    // 等待补充
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

// 使用
const rpmBucket = new TokenBucket(60, 60); // 60 RPM

async function callWithRateLimit(fn: () => Promise<any>) {
  await rpmBucket.acquire();
  return fn();
}
```

**何时使用**：令牌桶是具有突发容量的平滑速率限制的理想选择。它计算成本低廉且易于理解。

### 信号量用于并发限制

限制同时操作——对于连接池管理至关重要。

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
    
    // 等待许可
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

// 使用：最多 10 个并发请求
const concurrentLimiter = new Semaphore(10);

async function callLLM(prompt: string): Promise<string> {
  return concurrentLimiter.withLock(async () => {
    return llm.generate(prompt);
  });
}
```

**何时使用**：当上游有硬性并发连接限制时，信号量是必不可少的。它们以请求排队的代价防止资源耗尽。

### 优先级队列

具有重要性级别的公平排序——对于具有混合工作负载的生产系统必不可少。

```typescript
interface QueuedRequest {
  id: string;
  prompt: string;
  priority: number;  // 越高越紧急
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
      
      // 按优先级排序（降序），然后按创建时间
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

**何时使用**：当你有异构工作负载（例如交互式用户请求与批处理）时，优先级队列至关重要。它们确保高优先级请求不会被批量操作阻塞。

---

## 高级模式

### 指数退避重试

**架构注意**：重试逻辑属于调用方，而不是分散在代码库中。将其集中在重试处理器中，应用一致的政策。

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

**权衡**：重试增加尾部延迟，并可能在中断期间加剧速率限制压力。结合断路器使用。

### 断路器模式

当 LLM 提供商降级时，防止级联故障。

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 30000, // 30秒
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

**架构注意**：断路器与自适应速率限制器配合良好。当断路器打开时，自适应限制器将减少吞吐量，自然降低故障服务的负载。

### 自适应速率限制器

基于观察到的错误率自动调整——适合生产系统。

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
    // 每 30 秒自适应调整
    this.adjustLimits();
    
    // 获取所有限制
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
      // 错误太多：减少 20% 限制
      this.rpm.capacity *= 0.8;
      this.tpm.capacity *= 0.8;
      this.maxConcurrent = Math.floor(this.maxConcurrent * 0.8);
    } else if (errorRate < 0.01) {
      // 非常成功：增加 10% 限制
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

**权衡**：自适应限制需要为你的流量模式调整阈值。激进的适应可能导致振荡；保守的适应可能无法足够快地响应中断。

---

## 可观测性

### 需要跟踪的指标

```typescript
interface RateLimitMetrics {
  // 吞吐量
  requestsPerMinute: number;
  tokensPerMinute: number;
  
  // 健康状况
  errorRate: number;
  circuitBreakerState: string;
  
  // 队列
  queueDepth: number;
  averageWaitTime: number;
  
  // 限制
  utilizedCapacity: number;  // 0-1
  throttledRequests: number;
}

class RateLimitObserver {
  private metrics: RateLimitMetrics;
  
  recordRequest(tokens: number, latency: number, success: boolean) {
    // 更新 Prometheus 指标或类似指标
  }
  
  getMetrics(): RateLimitMetrics {
    return this.metrics;
  }
}
```

**关键告警指标**：
- 错误率 > 5% 持续 2 分钟
- 队列深度 > 100 超过 5 分钟
- 断路器打开

---

## 总结

| 模式 | 何时使用 | 关键权衡 |
|---------|-------------|---------------|
| 令牌桶 | 带突发的平滑速率限制 | 需要令牌估算 |
| 信号量 | 硬性并发限制 | 排队请求，增加延迟 |
| 优先级队列 | 混合工作负载优先级 | 更复杂的排序逻辑 |
| 重试 + 退避 | 瞬态故障 | 增加尾部延迟 |
| 断路器 | 防止级联故障 | 可能拒绝有效请求 |
| 自适应限制器 | 生产流量 | 需要调整 |

**架构决策指南**：
1. 单服务，低流量 → 令牌桶 + 信号量
2. 多应用共享预算 → 添加 API 网关层
3. 企业多租户 → 代理层，每租户限制
4. 关键任务 → 添加断路器 + 自适应限制器 + 完全可观测性
