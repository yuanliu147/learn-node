# 异步并发模式：架构决策指南

## 概述

选择正确的并发模式是一项具有持久性能、资源利用和系统弹性影响的架构决策。错误的选择可能导致吞吐量瓶颈、资源耗尽或级联故障。

**决策框架：**
- 操作是**依赖**（需要排序）还是**独立**？
- 你的**故障容限**是什么（全成功或部分 OK）？
- 你在管理**有限资源**（API 速率限制、连接）吗？
- **延迟 vs 吞吐量**要求是什么？

---

## 1. 顺序执行

### 何时使用
- 操作之间有**数据依赖**
- 你需要**原子排序**以保证正确性（例如，先读后写序列）
- 任何步骤失败应该**导致整个管道失败**
- 调试需要**可预测的执行顺序**

### 权衡
| 优点 | 缺点 |
|------|------|
| 简单易推理 | 无并行 = 最高延迟 |
| 保证排序 | 无法利用多核 |
| 易于调试 | 独立任务的吞吐量差 |

### 实现

```javascript
// 简单的基于循环的顺序
async function sequentialPromises(items) {
  const results = [];
  for (const item of items) {
    results.push(await processItem(item));
  }
  return results;
}

// 基于 reduce 的链式（Promise 管道）
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

### 反模式警告
顺序执行经常被默认使用，而并行才是正确的选择。如果操作是独立的，请并行化它们。

---

## 2. 并行执行 (Promise.all)

### 何时使用
- 操作**完全独立**
- 你需要**所有结果**才能继续
- **全有或全无**失败语义可接受
- 延迟关键且可以并行化

### 权衡
| 优点 | 缺点 |
|------|------|
| 最小总延迟 | 一个失败 = 全部失败 |
| 最大化吞吐量 | 直到最慢的完成才有结果 |
| 简单的心理模型 | 大量任务时内存压力 |

### 实现

```javascript
// 基本并行 - 所有必须成功
async function parallelAll(items) {
  return Promise.all(items.map(item => processItem(item)));
}

// 带错误处理 - 优雅降级
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

### 选择标准
- 使用 `Promise.all` 当：失败不可接受，需要一起获取结果
- 使用 `Promise.allSettled` 当：部分成功可接受，你需要所有结果

---

## 3. 批处理执行（并发限制）

### 何时使用
- **大量操作**可能压垮资源
- 外部 API 有**速率限制**（例如，每分钟 100 请求）
- 数据库连接有**池大小限制**
- 任务是 **CPU/内存密集型**
- 你需要**可预测的资源消耗**

### 权衡
| 优点 | 缺点 |
|------|------|
| 控制资源使用 | 实现更复杂 |
| 在速率受限 API 下存活 | 比无限并行吞吐量低 |
| 防止内存耗尽 | 需要调优并发 |
| 可预测的性能 | 批量大小影响延迟 |

### 实现

```javascript
// 固定批处理
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

// 动态工作队列 - 推荐用于生产
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

// 用法
const processor = new AsyncBatchProcessor(10);
const results = await Promise.all([
  processor.add(() => fetch('/api/1')),
  processor.add(() => fetch('/api/2')),
  processor.add(() => fetch('/api/3')),
]);
```

### 调优指南
- 从 `concurrency = (rate_limit / expected_response_time) * 0.8` 开始
- 监控 429（请求过多）错误
- 如果看到利用不足则增加；如果失败则减少

---

## 4. Promise.race() - 首个解决

### 何时使用
- **超时强制**长时间运行的操作
- **回退到备份**服务
- **取消语义**（与取消信号竞速）
- 从**多个等效端点**获得最快响应

### 权衡
| 优点 | 缺点 |
|------|------|
| 防止无限挂起 | 胜者可能是失败 |
| 启用回退链 | 哪个先完成不可预测 |
| 简单的取消模式 | 可能浪费慢者的资源 |

### 实现

```javascript
// 超时模式
async function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), ms)
  );
  return Promise.race([promise, timeout]);
}

// 最快端点模式
async function fastestEndpoint() {
  const endpoints = [
    fetch('https://primary.example.com/data'),
    fetch('https://secondary.example.com/data'),
  ];
  
  return Promise.race(endpoints);
}
```

### 重要
`Promise.race` 在**任何** promise 解决（履行或拒绝）时返回。如果你只关心第一个成功结果，使用 `Promise.any`。

---

## 5. Promise.any() - 首个成功

### 何时使用
- 你想要多个源的**任何成功响应**
- 提供相同能力的冗余服务
- **速度比来源更重要**的延迟关键路径

### 权衡
| 优点 | 缺点 |
|------|------|
| 最小化感知延迟 | 直到全部失败才忽略错误 |
| 自动尝试所有源 | 聚合所有错误，而不是第一个 |
| 一个源失败不级联 | 可能掩盖潜在问题 |

### 实现

```javascript
async function anySuccessful(endpoints) {
  return Promise.any(endpoints.map(url => fetch(url).then(r => r.json())));
}

// 错误处理 - 所有源都失败
try {
  const result = await Promise.any(failingPromises);
} catch (error) {
  console.log('All failed:', error.errors);
  // error.errors 包含所有单独拒绝
}
```

---

## 6. 记忆化 / 缓存

### 何时使用
- **昂贵操作**使用相同参数重复调用
- **读 heavy** 工作负载，更新不频繁
- **幂等操作**，新鲜度不关键
- 减少 API 调用以保持在速率限制内

### 权衡
| 优点 | 缺点 |
|------|------|
| 消除冗余工作 | 没有限制内存增长无界 |
| 减少 API 成本 | 数据陈旧风险 |
| 改善延迟 | 缓存失效复杂性 |

### 实现

```javascript
// 简单记忆化
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

// 基于 TTL 的缓存 - 推荐用于生产
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

// 用法
const fetchUserMemo = new MemoizedAsync(fetchUser, 30000);
```

### 缓存失效策略
- **TTL**：基于时间的过期（见上文）
- **LRU**：达到大小限制时驱逐最近最少使用
- **手动**：暴露 `invalidate(key)` 方法
- **事件驱动**：在写操作时失效

---

## 7. 重试模式

### 何时使用
- **瞬态失败**（网络抖动、临时过载）
- 针对**最终一致性系统**的操作
- **幂等操作**，重试安全
- 已知有**间歇性可用性**的服务

### 权衡
| 优点 | 缺点 |
|------|------|
| 优雅处理瞬态失败 | 可能恶化过载（雷鸣般的牛群） |
| 提高成功率 | 失败时延迟增加 |
| 简单实现 | 可能掩盖系统性问题 |

### 实现

```javascript
// 带指数退避的基本重试
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

// 带抖动的重试 - 防止雷鸣般的牛群
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

// 选择性重试 - 仅网络错误
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

### 反模式警告
切勿在验证错误、认证失败或 4xx 响应上重试。只在瞬态 5xx 错误和网络失败上重试。

---

## 8. 断路器模式

### 何时使用
- 调用**外部/不可靠服务**
- 防止微服务架构中的**级联故障**
- **快速失败**比挂起更好
- 防止因重复失败导致的**资源耗尽**

### 权衡
| 优点 | 缺点 |
|------|------|
| 防止级联失败 | 增加架构复杂性 |
| 给失败服务时间恢复 | 可能过早拒绝有效请求 |
| 提供服务健康可观察性 | 需要调优阈值 |

### 实现

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

### 状态机
```
CLOSED → (failure threshold reached) → OPEN
OPEN → (reset timeout elapsed) → HALF_OPEN
HALF_OPEN → (success) → CLOSED
HALF_OPEN → (failure) → OPEN
```

---

## 9. 防抖和节流

### 何时使用

| 模式 | 使用场景 | 行为 |
|------|----------|------|
| **防抖** | 搜索输入、表单验证 | 等待**停顿**后执行 |
| **节流** | 滚动处理器、调整大小事件 | 无论频率如何，按**固定间隔**执行 |

### 权衡
| 方面 | 防抖 | 节流 |
|------|------|------|
| 延迟 | 更高（等待停顿） | 更低（立即，限速） |
| 服务器负载 | 更低 | 更低（但可能高于需要） |
| 用户体验 | 可能感觉慢 | 更响应 |

### 实现

```javascript
// 防抖 - 等待沉默
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

// 节流 - 固定速率
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

## 10. 信号量模式

### 何时使用
- **严格并发限制**（不仅仅是批次）
- 限制**并行数据库查询**
- 控制**并行文件操作**
- 任何需要**显式获取/释放**资源的场景

### 权衡
| 优点 | 缺点 |
|------|------|
| 细粒度控制 | 比简单批处理更复杂 |
| 可以限制异构操作 | 需要手动获取/释放 |
| 对加权资源有用 | 如果没有正确释放容易泄漏 |

### 实现

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

// 用法 - 限制为 3 个并发重型操作
const semaphore = new Semaphore(3);

async function limitedTask() {
  return semaphore.use(() => performHeavyTask());
}
```

---

## 11. 异步队列模式

### 何时使用
- 带优先级支持的**作业处理系统**
- 需要**动态并发**调整
- **背压**处理（慢消费者 vs 快生产者）
- 构建**工作流引擎**

### 实现

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
  
  // 暂停处理
  pause() {
    this.concurrency = 0;
  }
  
  // 使用新限制恢复
  resume(concurrency = 1) {
    this.concurrency = concurrency;
    this.process();
  }
}
```

---

## 决策矩阵

| 需求 | 推荐模式 | 替代方案 |
|------|----------|----------|
| 独立并行任务 | `Promise.all` | `Promise.allSettled` |
| 速率受限 API | `AsyncBatchProcessor` | `Semaphore` |
| 多次相同结果 | `MemoizedAsync` | HTTP 缓存 |
| 慢操作超时 | `Promise.race` | `retry` + `timeout` |
| 最快成功响应 | `Promise.any` | 自定义竞速逻辑 |
| 瞬态失败 | `retry` + jitter | 断路器 |
| 级联失败保护 | `CircuitBreaker` | 隔板模式 |
| 用户输入优化 | `debounce` / `throttle` | - |
| 资源获取 | `Semaphore` | `AsyncQueue` |
| 顺序依赖 | 顺序 | `reduce` 链 |

---

## 应避免的反模式

1. **应该并行时顺序**：对独立操作使用 `for`/`await` 循环
2. **网络错误不重试**：在瞬态失败上盲目失败
3. **无界 Promise.all**：创建数千个并行任务
4. **外部调用无超时**：允许无限挂起
5. **在 4xx 错误上重试**：重试验证/认证失败
6. **无限制的记忆化**：无界缓存的内存泄漏
7. **断路器太敏感**：在偶尔的抖动上打开

---

## 模式组合

模式组合用于复杂场景：

```javascript
// 生产就绪的外部 API 调用
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
