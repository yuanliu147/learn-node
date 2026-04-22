# Node.js/V8 内存泄漏模式

## 架构视角

内存泄漏不仅仅是"忘记清理"—它们是**架构失败**，其中对象生命周期被无意地延长到预期范围之外。理解 V8 的堆架构揭示了*为什么*某些模式导致泄漏，以及*为什么*特定解决方案有效。

## 核心问题：意外保留

V8 的垃圾回收器追踪对象的可达性，而非开发者意图。如果一个对象通过任何引用链可达，它就是活的——无论你的业务逻辑说它是否应该如此。

```
泄漏机制：

意图:     Object X 应该在请求完成后死亡
            ─────────────────────────────────────────→

现实:    Object X ←──── closure ────── handler ←─ event emitter
            (reachable)    captures       retained    (never removed)

            V8 GC 看到: Object X 是可达的
            结果: X 无限期存活
```

## 模式 1：全局作用域锚点

### 为什么发生（架构）

全局变量是 V8 引用图中的根。GC 从根（全局对象、栈帧）开始，标记所有可达对象。全局变量**总是可达的**。

```javascript
// 架构: 全局对象是 GC 根
// 全局泄漏 = 永久泄漏

// 模式: 隐式全局变量
function processData(data) {
    result = processLargeData(data);  // 'result' 变成全局的
    return result;
}

// 模式: 无界限的全局缓存
const cache = {};  // 附加到全局对象

// 这个缓存中的每个条目都是 GC 根
// 条目存活到进程重启
```

### 架构解决方案

```javascript
// 解决方案 1: 模块作用域（非全局）
const cache = new Map();  // 模块级，非全局
                        // 模块死亡时死亡（进程重启）

// 解决方案 2: 带 WeakMap 的显式生命周期
const cache = new WeakMap();  // 没有引用时 key 可被 GC

// 解决方案 3: 限制包装器
class BoundedCache {
    #maxSize;
    #cache = new Map();
    
    constructor(maxSize = 100) {
        this.#maxSize = maxSize;
    }
    
    get(key) {
        return this.#cache.get(key);
    }
    
    set(key, value) {
        if (this.#cache.size >= this.#maxSize) {
            const firstKey = this.#cache.keys().next().value;
            this.#cache.delete(firstKey);  // LRU 驱逐
        }
        this.#cache.set(key, value);
    }
}
```

## 模式 2：闭包捕获链

### 为什么发生（架构）

V8 中的闭包创建**作用域链**，GC 必须追踪。每个闭包捕获其整个词法环境——不仅仅是它使用的变量。

```javascript
// 架构: 闭包创建持久作用域链

function createHandler() {
    const largeBuffer = new Array(10_000_000);  // 80MB
    
    // 这个闭包捕获: largeBuffer, someService, config
    return function handler(request) {
        return someService.process(request, largeBuffer);
    };
}

// 作用域链: handler → createHandler's scope → module scope → ...
// largeBuffer 只要 handler 存在就保持可达
```

### 隐藏类交互

```javascript
// 更糟: 闭包阻止 Map 空间优化
class RequestHandler {
    #largeData;
    #map;  // 隐藏类追踪属性形状
    
    constructor(data) {
        this.#largeData = data;  // 对象中的大缓冲区
    }
    
    createCallback() {
        // 这个闭包保持 'this' 存活
        // V8 不能优化掉 #largeData 即使从未使用
        return (result) => {
            return this.#largeData[0];  // 捕获整个对象
        };
    }
}
```

### 架构解决方案

```javascript
// 解决方案 1: 只提取你需要的
function createHandler() {
    const largeBuffer = new Array(10_000_000);
    
    // 只捕获需要的特定数据
    const processFn = largeBuffer.process.bind(largeBuffer);
    
    return function handler(request) {
        return processFn(request);  // 不捕获 largeBuffer
    };
}

// 解决方案 2: 显式解引用
function createHandler() {
    const largeBuffer = new Array(10_000_000);
    const handler = function handler(request) {
        return largeBuffer[0];  // 故意捕获
    };
    
    // 返回清理函数
    handler.destroy = () => {
        largeBuffer.length = 0;  // 释放内存
    };
    
    return handler;
}

// 解决方案 3: 对可选大数据使用 WeakRef
function createHandler() {
    const largeBuffer = new WeakRef(new Array(10_000_000));
    
    return function handler(request) {
        const buffer = largeBuffer.deref();
        if (!buffer) {
            throw new Error('Data no longer available');
        }
        return buffer[0];
    };
}
```

## 模式 3：事件发射器泄漏

### 为什么发生（架构）

事件发射器创建**双向引用图**：监听器通过 `this` 持有对其发射器的引用，发射器持有对监听器的引用。

```javascript
// 架构: 双向保留
emitter.on('event', handler);
    │
    ├── emitter holds: Map<event, Set<handler>>
    │
    └── handler closure holds: this (emitter reference)

如果 emitter 永远存活但 handler 应该是临时的...
handler（及其闭包作用域）也永远存活。
```

### 经典累积模式

```javascript
// 坏: 每次调用添加监听器，没有移除
class RequestProcessor {
    #emitter = new EventEmitter();
    
    processRequests() {
        // 监听器随每次调用累积
        this.#emitter.on('data', (data) => {
            this.handleData(data);  // 'this' 保持 processor 存活
        });
    }
}

// 每次 processRequests() 调用:
    // 1. 创建新闭包
    // 2. 闭包捕获 'this'（整个 RequestProcessor）
    // 3. 监听器添加到 emitter
    // 4. 只要 emitter 存活，Processor 就无法被 GC
```

### 架构解决方案

```javascript
// 解决方案 1: AbortController 模式（现代）
class RequestProcessor {
    #emitter = new EventEmitter();
    #aborts = new AbortController();
    
    processRequests() {
        this.#emitter.on('data', 
            (data) => this.handleData(data),
            { signal: this.#aborts.signal }
        );
    }
    
    destroy() {
        this.#aborts.abort();  // 移除所有注册的监听器
    }
}

// 解决方案 2: 显式监听器生命周期
class RequestProcessor {
    #emitter = new EventEmitter();
    #listener = null;
    
    start() {
        this.#listener = (data) => this.handleData(data);
        this.#emitter.on('data', this.#listener);
    }
    
    stop() {
        if (this.#listener) {
            this.#emitter.off('data', this.#listener);
            this.#listener = null;
        }
    }
}

// 解决方案 3: 瞬态处理器使用 once
function onFirstData(emitter, handler) {
    emitter.once('data', (data) => {
        handler(data);
    });  // 首次调用后自动移除
}
```

## 模式 4：定时器锚点

### 为什么发生（架构）

`setInterval`/`setTimeout` 创建**根引用**，定时器系统持有该引用。回调——及其捕获的所有内容——保持可达，直到定时器被清除或进程退出。

```javascript
// 架构: 定时器系统持有引用
globalTimers.add(timerId, callback);
    │
    └── callback closure captured
            │
            └── Everything callback references stays alive

// 定时器未清除 = 闭包作用域永远存活
```

### 通过闭包累积

```javascript
// 坏: 闭包 + interval = 内存增长
function startProcessing() {
    const data = loadLargeData();  // 被 interval 捕获
    
    setInterval(() => {
        processData(data);  // data 保持存活
    }, 1000);
}

// 每次 startProcessing() 调用:
    // 1. 创建新大数据数组
    // 2. 创建引用该数据的 interval
    // 3. Interval 永远存活（永不清除）
    // 4. 所有数据数组累积
```

### 架构解决方案

```javascript
// 解决方案 1: 带计数器的自动清除定时器
function startProcessing(maxIterations = 100) {
    let count = 0;
    
    const interval = setInterval(() => {
        const data = loadLargeData();  // 每次迭代新鲜
        processData(data);
        
        if (++count >= maxIterations) {
            clearInterval(interval);  // 自动清理
        }
    }, 1000);
    
    return interval;  // 调用者负责清理
}

// 解决方案 2: 使用 WeakRef 缓存数据
function startProcessing() {
    const cacheRef = new WeakRef(new Map());
    
    return setInterval(() => {
        const cache = cacheRef.deref();
        if (!cache) {
            // Cache 被 GC 了，重新创建
            cacheRef = new WeakRef(new Map());
        }
        // 使用可能已消失的缓存
    }, 1000);
}

// 解决方案 3: 单例模式共享资源
class ProcessingService {
    static #instance = null;
    #interval = null;
    #data = null;
    
    static getInstance() {
        if (!ProcessingService.#instance) {
            ProcessingService.#instance = new ProcessingService();
        }
        return ProcessingService.#instance;
    }
    
    start() {
        if (this.#interval) return;
        this.#data = loadLargeData();
        this.#interval = setInterval(() => {
            processData(this.#data);
        }, 1000);
    }
    
    stop() {
        clearInterval(this.#interval);
        this.#interval = null;
        this.#data = null;
    }
}
```

## 模式 5：无界缓存增长

### 为什么发生（架构）

JavaScript 中的 Map 和 Set 没有驱逐语义。作为缓存使用的 `Map` 无限增长，因为每个条目都是**强可达的**。

```
架构: 缓存作为 GC 保留问题

缓存条目生命周期:
1. cache.set(key, value) → 条目添加
2. 条目通过 Map 内部存储强可达
3. 无自动移除
4. 只要 key 在 Map 中，value 就保持存活

如果缓存永远增长 → Old Space 永远增长 → OOM
```

### 缓存的隐藏代价

```javascript
// 坏: 没有驱逐的缓存
const cache = new Map();

function getUser(id) {
    if (!cache.has(id)) {
        cache.set(id, loadUserFromDB(id));  // 每个用户永远存活
    }
    return cache.get(id);
}

// 100 万请求后:
// - Old Space 中有 100 万个 User 对象
// - 所有对象在每次 Major GC 中存活
// - 内存单调增长
```

### 架构解决方案

```javascript
// 解决方案 1: LRU 缓存（由设计限制）
class LRUCache {
    #maxSize;
    #map = new Map();
    
    constructor(maxSize = 100) {
        this.#maxSize = maxSize;
    }
    
    get(key) {
        if (!this.#map.has(key)) return undefined;
        
        // 移到末尾（最近使用）
        const value = this.#map.get(key);
        this.#map.delete(key);
        this.#map.set(key, value);
        return value;
    }
    
    set(key, value) {
        if (this.#map.has(key)) {
            this.#map.delete(key);
        } else if (this.#map.size >= this.#maxSize) {
            // 移除最少使用的（第一个条目）
            const firstKey = this.#map.keys().next().value;
            this.#map.delete(firstKey);
        }
        this.#map.set(key, value);
    }
}

// 解决方案 2: 基于 TTL 的过期
class TTLCache {
    #ttl;
    #cache = new Map();
    
    constructor(ttlMs = 60000) {
        this.#ttl = ttlMs;
    }
    
    get(key) {
        const entry = this.#cache.get(key);
        if (!entry) return undefined;
        
        if (Date.now() > entry.expires) {
            this.#cache.delete(key);
            return undefined;
        }
        return entry.value;
    }
    
    set(key, value) {
        this.#cache.set(key, {
            value,
            expires: Date.now() + this.#ttl
        });
    }
}

// 解决方案 3: 用于对象键缓存的 WeakMap
const objectCache = new WeakMap();  // 键被 GC 时值也被 GC

function processObject(obj) {
    if (!objectCache.has(obj)) {
        objectCache.set(obj, expensiveOperation(obj));
    }
    return objectCache.get(obj);
}
// obj 必须手动解引用以释放缓存值
```

## 模式 6：Promise 链保留

### 为什么发生（架构）

Promise 创建隐式引用链。待处理的 promise 持有以下引用：
1. 它的 `then` 回调（闭包作用域）
2. 这些回调捕获的变量
3. 拒绝处理器

```javascript
// 架构: Promise 保留模型
async function process(data) {
    const context = createHeavyContext(data);  // 大对象
    
    return fetch(url)
        .then(response => {
            return processWithContext(context, response);
        })
        .catch(error => {
            // 这个闭包也捕获 context
            handleError(context, error);
        });
}

// Promise 链生命周期:
    // 1. async 函数返回 Promise（链开始）
    // 2. fetch() promise 创建
    // 3. .then() 创建中间 promise
    // 4. .catch() 创建另一个 promise
    // 5. 所有闭包被捕获直到链解决/拒绝
```

### 清理 vs 保留

```javascript
// 问题: Promise 链保持 context 存活
async function processWithRetry(data, maxRetries = 3) {
    const context = new LargeContext(data);  // 50MB
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fetch(url)
                .then(r => r.json())
                .then(result => processResult(context, result));
        } catch (e) {
            // 重试: context 在迭代间保持存活
        }
    }
    
    // Context 存活整个重试循环
    // 仅在最终尝试或成功后释放
}
```

### 架构解决方案

```javascript
// 解决方案 1: 使用后显式置空
async function process(data) {
    const context = createHeavyContext(data);
    try {
        const result = await fetch(url).then(r => r.json());
        return processResult(context, result);
    } finally {
        // await 完成后显式释放
        context = null;
    }
}

// 解决方案 2: 结构化错误处理（避免 catch 链）
async function process(data) {
    const context = createHeavyContext(data);
    let result;
    
    try {
        const response = await fetch(url);
        result = await response.json();
    } catch (error) {
        context.cleanup();
        throw error;
    }
    
    context.cleanup();  // 显式清理
    return processResult(context, result);
}

// 解决方案 3: 带超时的 AbortController
async function process(data, timeoutMs = 5000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(url, { signal: controller.signal });
        return await response.json();
    } finally {
        clearTimeout(timeout);
        // 如果 fetch 被中止，context 自动释放
    }
}
```

## 模式 7：原生模块引用

### 为什么发生（架构）

Addon（原生模块）使用 `node-gyp`，通过**外部资源**与 V8 堆交互。V8 不直接管理这些——它们由原生代码持有。

```javascript
// 架构: 外部资源管理
const addon = require('./native-addon');

// 外部资源:
addon.createBuffer(1024 * 1024);  // C++ 堆，非 V8 堆
    │
    └── Tracked by: addon._exernalMemory
            │
            └── Increases process.memoryUsage().external
            └── 不被 V8 GC 回收
```

### Addon 中的缓冲区保留

```javascript
// addons 中的典型泄漏模式
class NativeProcessor {
    #buffers = [];
    
    process(data) {
        // 在 C++ 中创建的缓冲区，存储在 JS 数组中
        const buffer = this.#native.createBuffer(data);
        this.#buffers.push(buffer);  // 显式保留
        
        // 即使在 C++ 中释放了缓冲区，
        // JS 数组条目仍使其在 V8 堆中保持存活
    }
}
```

### 架构解决方案

```javascript
// 解决方案 1: 显式追踪和释放
class NativeProcessor {
    #buffers = [];
    #native;
    
    constructor() {
        this.#native = require('./native-addon');
    }
    
    process(data) {
        const buffer = this.#native.createBuffer(data);
        this.#buffers.push(buffer);
        
        // 返回清理函数
        return () => {
            this.#native.releaseBuffer(buffer);
            const idx = this.#buffers.indexOf(buffer);
            if (idx >= 0) this.#buffers.splice(idx, 1);
        };
    }
    
    destroy() {
        // 释放所有缓冲区
        for (const buffer of this.#buffers) {
            this.#native.releaseBuffer(buffer);
        }
        this.#buffers = [];
    }
}

// 解决方案 2: 监控外部内存
setInterval(() => {
    const { heapUsed, heapTotal, external } = process.memoryUsage();
    
    const externalRatio = external / (heapUsed + external);
    
    if (externalRatio > 0.5) {
        console.error('External memory > 50% of total. Potential addon leak.');
        // 触发清理或告警
    }
}, 10000);
```

## 诊断架构

### 堆快照分析

```javascript
// 架构: 快照在时间点捕获引用图
const v8 = require('v8');
const fs = require('fs');

function captureSnapshot(filename = 'heap.heapsnapshot') {
    const filepath = v8.writeHeapSnapshot(filename);
    console.log(`Snapshot: ${filepath}`);
    return filepath;
}

// 关键洞察: 随着时间比较快照
// 泄漏的对象在后面的快照中出现但前面的没有
// 保留大小显示对象为什么被保留（到 GC 根的路径）
```

### 内存增长模式识别

```javascript
// 架构: 通过增长模式识别泄漏
const v8 = require('v8');

class MemoryMonitor {
    #samples = [];
    #interval;
    
    start(intervalMs = 5000) {
        this.#interval = setInterval(() => {
            this.#samples.push({
                timestamp: Date.now(),
                ...process.memoryUsage()
            });
        }, intervalMs);
    }
    
    analyze() {
        if (this.#samples.length < 2) return null;
        
        const first = this.#samples[0];
        const last = this.#samples[this.#samples.length - 1];
        
        const growth = last.heapUsed - first.heapUsed;
        const duration = last.timestamp - first.timestamp;
        const rate = growth / duration;  // bytes per ms
        
        return {
            totalGrowth: growth,
            growthRate: rate,
            isLeaking: rate > 0.1,  // >0.1 bytes/ms threshold
            samples: this.#samples.length
        };
    }
    
    stop() {
        clearInterval(this.#interval);
    }
}

// 使用
const monitor = new MemoryMonitor();
monitor.start();

setTimeout(() => {
    const analysis = monitor.analyze();
    console.log(analysis);
    monitor.stop();
}, 60000);
```

### GC 阶段泄漏指标

| 指标 | 可能原因 | 受影响的 GC 阶段 |
|------|---------|-----------------|
| `heapUsed` 单调增长 | 无界保留 | 两者 |
| Major GC 后增长停止 | 年轻空间提升问题 | Minor GC |
| 无增长平台期 | 全局泄漏（根） | Major GC |
| `external` 增加 | 原生 addon 保留 | N/A |

## 架构预防框架

### 显式生命周期设计

```javascript
// 每个对象应该有明确的所属权
class ResourceOwner {
    #resources = new Set();
    #orphaned = new FinalizationRegistry(name => {
        console.warn(`Resource ${name} was garbage collected without cleanup`);
    });
    
    register(id, resource, cleanup) {
        this.#resources.add({ id, resource, cleanup });
        this.#orphaned.register(resource, id);
    }
    
    release(id) {
        for (const entry of this.#resources) {
            if (entry.id === id) {
                entry.cleanup();
                this.#resources.delete(entry);
                this.#orphaned.unregister(entry.resource);
                return;
            }
        }
    }
    
    destroy() {
        for (const entry of this.#resources) {
            entry.cleanup();
        }
        this.#resources.clear();
    }
}
```

### 内存预算

```javascript
// 架构: 预算驱动的资源管理
class MemoryBudget {
    #limit;
    #used = 0;
    #allocations = new Map();
    
    constructor(limitBytes) {
        this.#limit = limitBytes;
    }
    
    allocate(id, sizeBytes) {
        if (this.#used + sizeBytes > this.#limit) {
            throw new Error(`Memory budget exceeded: ${this.#used + sizeBytes} > ${this.#limit}`);
        }
        this.#used += sizeBytes;
        this.#allocations.set(id, sizeBytes);
    }
    
    release(id) {
        const size = this.#allocations.get(id);
        if (size !== undefined) {
            this.#used -= size;
            this.#allocations.delete(id);
        }
    }
    
    getStats() {
        return {
            limit: this.#limit,
            used: this.#used,
            available: this.#limit - this.#used,
            utilization: this.#used / this.#limit
        };
    }
}
```

## 泄漏预防清单

### 架构审查问题

- [ ] **作用域锚定**: 对象只有在真正是全局的才附加到全局/模块作用域？
- [ ] **闭包卫生**: 闭包是否只捕获必要的内容？
- [ ] **事件生命周期**: 监听器在其源被销毁时是否被移除？
- [ ] **定时器纪律**: 所有定时器是否在清理路径中被清除？
- [ ] **缓存界限**: 缓存是否有驱逐策略？
- [ ] **Promise 意识**: Promise 链是否在其有用性之后保持引用？
- [ ] **原生清理**: addon 资源是否有显式释放方法？
- [ ] **内存预算**: 内存结构是否有限制？

### 代码审查信号

```javascript
// 红旗（架构债务）:
new Array()           // 无大小限制
new Map()              // 无驱逐
.push() in loop        // 潜在累积
setInterval without    // 无明确清理路径
  clearInterval
.on() without .off()   // 监听器累积
global variable        // 永久保留
new Promise() stored   // 链无限期保留
```

## 相关

- [Heapdump 分析](./heapdump-analysis.md) - 调试技术
- [V8 堆结构](./v8-heap-structure.md) - 架构基础
- [Scavenge 算法](./scavenge-algorithm.md) - Minor GC 行为
- [Mark-Sweep-Compact](./mark-sweep-compact.md) - Major GC 行为
