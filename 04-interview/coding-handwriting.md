# Coding Handwriting - 手写代码题

> 限制时间练习，白板或纸上实现，重点理解底层原理

---

## 基础实现类

### Easy #1: 实现简易 EventEmitter

```javascript
/**
 * 实现一个 EventEmitter，支持 on/emit/off
 * 
 * 示例:
 * const emitter = new EventEmitter();
 * emitter.on('event', (arg) => console.log(arg));
 * emitter.emit('event', 'hello'); // 输出 'hello'
 * emitter.off('event', listener);
 */
class EventEmitter {
  // 你的实现
}
```

<details>
<summary>参考答案</summary>

```javascript
class EventEmitter {
  constructor() {
    this.events = Object.create(null);
  }
  
  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return this;
  }
  
  emit(event, ...args) {
    const listeners = this.events[event] || [];
    for (const listener of listeners) {
      listener(...args);
    }
    return this;
  }
  
  off(event, listener) {
    if (!this.events[event]) return this;
    const idx = this.events[event].indexOf(listener);
    if (idx > -1) {
      this.events[event].splice(idx, 1);
    }
    return this;
  }
  
  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }
}
```

</details>

---

### Easy #2: 实现防抖函数 debounce

```javascript
/**
 * 防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟毫秒
 * 
 * 示例:
 * const debounced = debounce(fetchData, 300);
 * window.addEventListener('resize', debounced);
 */
function debounce(fn, delay) {
  // 你的实现
}
```

<details>
<summary>参考答案</summary>

```javascript
function debounce(fn, delay) {
  let timer = null;
  
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

// 带立即执行的版本
function debounceImmediate(fn, delay, immediate = false) {
  let timer = null;
  
  return function(...args) {
    const callNow = immediate && !timer;
    
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      if (callNow) timer = null;
    }, delay);
    
    if (callNow) {
      fn.apply(this, args);
    }
  };
}
```

</details>

---

### Easy #3: 实现节流函数 throttle

```javascript
/**
 * 节流函数
 * @param {Function} fn - 要节流的函数
 * @param {number} limit - 间隔毫秒
 * 
 * 示例:
 * const throttled = throttle(saveData, 1000);
 * window.addEventListener('scroll', throttled);
 */
function throttle(fn, limit) {
  // 你的实现
}
```

<details>
<summary>参考答案</summary>

```javascript
function throttle(fn, limit) {
  let inThrottle = false;
  
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// 时间戳版本 (首次立即执行)
function throttleTimestamp(fn, limit) {
  let prev = 0;
  
  return function(...args) {
    const now = Date.now();
    if (now - prev >= limit) {
      fn.apply(this, args);
      prev = now;
    }
  };
}
```

</details>

---

### Medium #4: 实现简易 Promise

```javascript
/**
 * 实现一个简易 Promise，符合 Promises/A+ 规范
 * 支持 then, catch, finally, Promise.resolve, Promise.reject
 */
class MyPromise {
  // 你的实现
}
```

<details>
<summary>参考答案</summary>

```javascript
class MyPromise {
  constructor(executor) {
    this.state = 'pending';
    this.value = undefined;
    this.handlers = [];
    
    const resolve = (value) => {
      if (this.state !== 'pending') return;
      this.state = 'fulfilled';
      this.value = value;
      this.handlers.forEach(this._handle);
    };
    
    const reject = (reason) => {
      if (this.state !== 'pending') return;
      this.state = 'rejected';
      this.value = reason;
      this.handlers.forEach(this._handle);
    };
    
    try {
      executor(resolve, reject);
    } catch (err) {
      reject(err);
    }
  }
  
  _handle = ({ onFulfilled, onRejected, resolve, reject }) => {
    if (this.state === 'fulfilled') {
      onFulfilled ? resolve(onFulfilled(this.value)) : resolve(this.value);
    } else if (this.state === 'rejected') {
      onRejected ? resolve(onRejected(this.value)) : reject(this.value);
    } else {
      this.handlers.push({ onFulfilled, onRejected, resolve, reject });
    }
  }
  
  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      this._handle({ onFulfilled, onRejected, resolve, reject });
    });
  }
  
  catch(onRejected) {
    return this.then(null, onRejected);
  }
  
  finally(fn) {
    return this.then(
      value => { fn(); return value; },
      reason => { fn(); throw reason; }
    );
  }
  
  static resolve(value) {
    return new MyPromise(resolve => resolve(value));
  }
  
  static reject(reason) {
    return new MyPromise((_, reject) => reject(reason));
  }
}
```

</details>

---

### Medium #5: 实现 LRU Cache

```javascript
/**
 * 实现 LRU (Least Recently Used) 缓存
 * 
 * 示例:
 * const cache = new LRUCache(3);
 * cache.set('a', 1);
 * cache.set('b', 2);
 * cache.set('c', 3);
 * cache.get('a'); // 1, a 变成最新
 * cache.set('d', 4); // 淘汰 b
 * cache.get('b'); // undefined
 */
class LRUCache {
  constructor(capacity) {
    // 你的实现
  }
  
  get(key) {
    // 你的实现
  }
  
  set(key, value) {
    // 你的实现
  }
}
```

<details>
<summary>参考答案</summary>

```javascript
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }
  
  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    // 重新插入使其变成最新
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }
  
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // 删除最旧的 (Map 的第一个)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

// 双向链表版本 (更高效)
class LRUNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

class LRUCacheLinked {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
    this.head = new LRUNode(null, null);
    this.tail = new LRUNode(null, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }
  
  _remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }
  
  _add(node) {
    node.next = this.tail;
    node.prev = this.tail.prev;
    this.tail.prev.next = node;
    this.tail.prev = node;
  }
  
  get(key) {
    if (!this.map.has(key)) return undefined;
    const node = this.map.get(key);
    this._remove(node);
    this._add(node);
    return node.value;
  }
  
  set(key, value) {
    if (this.map.has(key)) {
      this._remove(this.map.get(key));
    }
    const node = new LRUNode(key, value);
    this._add(node);
    this.map.set(key, node);
    
    if (this.map.size > this.capacity) {
      const first = this.head.next;
      this._remove(first);
      this.map.delete(first.key);
    }
  }
}
```

</details>

---

## 算法类

### Medium #6: 实现深拷贝

```javascript
/**
 * 实现深拷贝，支持 Date、RegExp、Object、Array、循环引用
 * @param {any} obj - 要拷贝的对象
 * @returns {any}
 */
function deepClone(obj) {
  // 你的实现
}
```

<details>
<summary>参考答案</summary>

```javascript
function deepClone(obj, weakMap = new WeakMap()) {
  // 原始类型直接返回
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // 处理循环引用
  if (weakMap.has(obj)) {
    return weakMap.get(obj);
  }
  
  // 处理 Date
  if (obj instanceof Date) {
    return new Date(obj);
  }
  
  // 处理 RegExp
  if (obj instanceof RegExp) {
    return new RegExp(obj);
  }
  
  // 处理 Array
  if (Array.isArray(obj)) {
    const arr = [];
    weakMap.set(obj, arr);
    for (const item of obj) {
      arr.push(deepClone(item, weakMap));
    }
    return arr;
  }
  
  // 处理普通对象
  const copy = {};
  weakMap.set(obj, copy);
  for (const key of Object.keys(obj)) {
    copy[key] = deepClone(obj[key], weakMap);
  }
  return copy;
}

// 使用 Map 处理所有引用类型
function deepCloneFull(obj, memory = new Map()) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (memory.has(obj)) return memory.get(obj);
  
  const types = [Date, RegExp, Error];
  const constructor = obj.constructor;
  
  if (types.includes(constructor)) {
    const clone = new constructor(obj);
    memory.set(obj, clone);
    return clone;
  }
  
  const clone = Array.isArray(obj) ? [] : {};
  memory.set(obj, clone);
  
  Reflect.ownKeys(obj).forEach(key => {
    clone[key] = deepCloneFull(obj[key], memory);
  });
  
  return clone;
}
```

</details>

---

### Medium #7: 实现防重复请求 (请求合并)

```javascript
/**
 * 实现请求合并，避免同一时间多个相同请求
 * 
 * 示例:
 * const fetcher = createRequestDeduplicator();
 * fetcher.fetch('/api/user').then(...);  // 实际只发一次请求
 * fetcher.fetch('/api/user').then(...);  // 复用上述请求
 */
function createRequestDeduplicator() {
  // 你的实现
}
```

<details>
<summary>参考答案</summary>

```javascript
function createRequestDeduplicator() {
  const pending = new Map();
  
  return {
    async fetch(url, options) {
      const key = url + JSON.stringify(options || {});
      
      if (pending.has(key)) {
        console.log('复用已有请求');
        return pending.get(key);
      }
      
      const promise = fetch(url, options).finally(() => {
        pending.delete(key);
      });
      
      pending.set(key, promise);
      return promise;
    }
  };
}

// 更完整的版本：包含并发限制
function createRequestManager(concurrency = 5) {
  const queue = [];
  let running = 0;
  
  const execute = async () => {
    if (running >= concurrency || queue.length === 0) return;
    running++;
    const { url, options, resolve, reject } = queue.shift();
    
    try {
      const response = await fetch(url, options);
      resolve(response);
    } catch (err) {
      reject(err);
    } finally {
      running--;
      execute();
    }
  };
  
  return {
    request(url, options = {}) {
      return new Promise((resolve, reject) => {
        queue.push({ url, options, resolve, reject });
        execute();
      });
    }
  };
}
```

</details>

---

### Hard #8: 实现简易的 Stream Pipeline

```javascript
/**
 * 实现 stream.pipeline，类似 node:stream.pipeline
 * 将多个流串联起来，错误自动传递，全部完成 resolve
 * 
 * 示例:
 * const read = fs.createReadStream('input.txt');
 * const write = fs.createWriteStream('output.txt');
 * await pipeline(read, transform, write);
 */
async function pipeline(...streams) {
  // 你的实现
}
```

<details>
<summary>参考答案</summary>

```javascript
const { pipeline: nativePipeline } = require('stream');

async function pipeline(...streams) {
  // 使用原生实现
  return new Promise((resolve, reject) => {
    nativePipeline(
      ...streams,
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

// 手写版本 (简化)
function manualPipeline(...streams) {
  return new Promise((resolve, reject) => {
    let ended = false;
    
    const cleanup = (err) => {
      if (ended) return;
      ended = true;
      
      if (err) {
        for (const stream of streams) {
          stream.destroy();
        }
        reject(err);
      } else {
        resolve();
      }
    };
    
    for (let i = 0; i < streams.length - 1; i++) {
      const current = streams[i];
      const next = streams[i + 1];
      
      current.on('error', cleanup);
      next.on('error', cleanup);
      current.pipe(next);
    }
    
    const last = streams[streams.length - 1];
    last.on('finish', () => cleanup());
    last.on('error', cleanup);
  });
}

// Readable → Transform → Writable 手动实现
function transformPipeline(readable, transform, writable) {
  return new Promise((resolve, reject) => {
    readable.on('error', reject);
    transform.on('error', reject);
    writable.on('error', reject);
    
    readable.on('end', () => {
      transform.end();
    });
    
    transform.on('data', (chunk) => {
      if (!writable.write(chunk)) {
        readable.pause();
        writable.once('drain', () => readable.resume());
      }
    });
    
    transform.on('end', () => {
      writable.end();
    });
    
    writable.on('finish', resolve);
  });
}
```

</details>

---

### Hard #9: 实现异步并发控制器

```javascript
/**
 * 实现一个异步任务调度器，限制并发数
 * 
 * 示例:
 * const scheduler = new TaskScheduler(2);
 * scheduler.add(() => fetch('/api/1')); // 立即执行
 * scheduler.add(() => fetch('/api/2')); // 立即执行
 * scheduler.add(() => fetch('/api/3')); // 等待前面的完成
 */
class TaskScheduler {
  constructor(maxConcurrency) {
    // 你的实现
  }
  
  add(task) {
    // 你的实现
  }
}
```

<details>
<summary>参考答案</summary>

```javascript
class TaskScheduler {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.running = 0;
    this.queue = [];
  }
  
  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._execute();
    });
  }
  
  _execute() {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }
    
    this.running++;
    const { task, resolve, reject } = this.queue.shift();
    
    task()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this.running--;
        this._execute(); // 执行下一个
      });
  }
}

// 带优先级的版本
class PriorityTaskScheduler {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.running = 0;
    this.queues = new Map(); // priority -> []
  }
  
  add(task, priority = 0) {
    return new Promise((resolve, reject) => {
      if (!this.queues.has(priority)) {
        this.queues.set(priority, []);
      }
      this.queues.get(priority).push({ task, resolve, reject });
      this._execute();
    });
  }
  
  _execute() {
    if (this.running >= this.maxConcurrency) return;
    
    const priorities = [...this.queues.keys()].sort((a, b) => b - a);
    
    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue.length > 0) {
        this.running++;
        const { task, resolve, reject } = queue.shift();
        
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.running--;
            this._execute();
          });
        break;
      }
    }
  }
}
```

</details>

---

### Hard #10: 实现 Async Pool (异步池)

```javascript
/**
 * 实现异步资源池，限制同时打开的连接数
 * 
 * 示例:
 * const pool = new AsyncPool(async () => {
 *   const conn = await createConnection();
 *   return conn;
 * }, 10); // 最多 10 个并发连接
 * 
 * const conn = await pool.acquire();
 * // 使用 conn...
 * pool.release(conn);
 */
class AsyncPool {
  constructor(createResource, maxSize) {
    // 你的实现
  }
  
  async acquire() {
    // 你的实现
  }
  
  release(resource) {
    // 你的实现
  }
  
  async destroy() {
    // 你的实现
  }
}
```

<details>
<summary>参考答案</summary>

```javascript
class AsyncPool {
  constructor(createResource, maxSize) {
    this.createResource = createResource;
    this.maxSize = maxSize;
    this.available = []; // 可用资源
    this.acquired = new Set(); // 已被借出
    this.pending = []; // 等待获取的请求
    this.destroyed = false;
  }
  
  async acquire() {
    if (this.destroyed) {
      throw new Error('Pool has been destroyed');
    }
    
    // 有可用资源
    if (this.available.length > 0) {
      const resource = this.available.pop();
      this.acquired.add(resource);
      return resource;
    }
    
    // 未达到上限，创建新资源
    if (this.acquired.size < this.maxSize) {
      const resource = await this.createResource();
      this.acquired.add(resource);
      return resource;
    }
    
    // 达到上限，等待
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }
  
  release(resource) {
    if (!this.acquired.has(resource)) {
      return false;
    }
    
    this.acquired.delete(resource);
    
    // 处理等待中的请求
    if (this.pending.length > 0) {
      const { resolve, reject } = this.pending.shift();
      this.acquired.add(resource);
      resolve(resource);
    } else {
      this.available.push(resource);
    }
    
    return true;
  }
  
  async destroy() {
    this.destroyed = true;
    
    // 关闭所有资源
    await Promise.all(
      [...this.available, ...this.acquired].map(async (resource) => {
        if (resource.close) {
          await resource.close();
        } else if (resource.destroy) {
          await resource.destroy();
        }
      })
    );
    
    this.available = [];
    this.acquired.clear();
    
    // 拒绝所有等待的请求
    for (const { reject } of this.pending) {
      reject(new Error('Pool destroyed'));
    }
    this.pending = [];
  }
}
```

</details>

---

## 装饰器与元编程

### Medium #11: 实现 memoize 装饰器

```javascript
/**
 * 实现记忆化装饰器，缓存函数结果
 * 
 * 示例:
 * const memoized = memoize(expensiveFunction);
 * memoized(1, 2); // 第一次计算
 * memoized(1, 2); // 使用缓存
 */
function memoize(fn) {
  // 你的实现
}
```

<details>
<summary>参考答案</summary>

```javascript
function memoize(fn) {
  const cache = new Map();
  
  return function(...args) {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

// 支持异步函数
function memoizeAsync(fn) {
  const cache = new Map();
  const pending = new Map();
  
  return function(...args) {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return Promise.resolve(cache.get(key));
    }
    
    if (pending.has(key)) {
      return pending.get(key);
    }
    
    const promise = fn.apply(this, args)
      .then(result => {
        cache.set(key, result);
        pending.delete(key);
        return result;
      })
      .catch(err => {
        pending.delete(key);
        throw err;
      });
    
    pending.set(key, promise);
    return promise;
  };
}

// 带 TTL 的版本
function memoizeWithTTL(fn, ttlMs) {
  const cache = new Map();
  
  return function(...args) {
    const key = JSON.stringify(args);
    const now = Date.now();
    
    if (cache.has(key)) {
      const { value, expire } = cache.get(key);
      if (now < expire) {
        return value;
      }
      cache.delete(key);
    }
    
    const result = fn.apply(this, args);
    cache.set(key, { value: result, expire: now + ttlMs });
    return result;
  };
}
```

</details>

---

### Medium #12: 实现 Retry 装饰器

```javascript
/**
 * 实现重试装饰器
 * 
 * 示例:
 * const retryFetch = retry(fetch, {
 *   retries: 3,
 *   delay: 1000,
 *   backoff: 2 // 指数退避
 * });
 */
function retry(fn, options = {}) {
  const { retries = 3, delay = 1000, backoff = 1 } = options;
  
  return async function(...args) {
    // 你的实现
  };
}
```

<details>
<summary>参考答案</summary>

```javascript
function retry(fn, options = {}) {
  const { 
    retries = 3, 
    delay = 1000, 
    backoff = 1,
    retryIf = (err) => true // 判断是否重试
  } = options;
  
  return async function(...args) {
    let lastError;
    let currentDelay = delay;
    
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn.apply(this, args);
      } catch (err) {
        lastError = err;
        
        if (i === retries || !retryIf(err)) {
          throw err;
        }
        
        console.log(`Retry ${i + 1}/${retries} after ${currentDelay}ms`);
        await sleep(currentDelay);
        currentDelay *= backoff;
      }
    }
    
    throw lastError;
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 使用示例
const safeFetch = retry(fetch, {
  retries: 3,
  delay: 1000,
  backoff: 2,
  retryIf: (err) => err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT'
});

const fetchWithToken = retry(async (url, token) => {
  const res = await fetch(url, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}, { retries: 3 });
```

</details>

---

## 限时挑战

每题建议时间：Easy 5-10min, Medium 15-20min, Hard 25-30min

| # | 题目 | 难度 | 考察点 |
|---|------|------|--------|
| 1 | EventEmitter | Easy | 面向对象、发布订阅 |
| 2 | debounce | Easy | 闭包、定时器 |
| 3 | throttle | Easy | 闭包、定时器 |
| 4 | Promise | Medium | 异步、状态机 |
| 5 | LRU Cache | Medium | 数据结构、Map |
| 6 | deepClone | Medium | 递归、循环引用 |
| 7 | 请求合并 | Medium | 缓存、并发控制 |
| 8 | Stream Pipeline | Hard | Stream、pipe、错误传播 |
| 9 | Task Scheduler | Hard | 队列、并发控制 |
| 10 | Async Pool | Hard | 资源管理、状态管理 |
| 11 | memoize | Medium | 装饰器、缓存 |
| 12 | retry | Medium | 装饰器、错误处理 |
