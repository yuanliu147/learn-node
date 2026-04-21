# Memory Leak Patterns in Node.js/V8

## Architectural Perspective

Memory leaks aren't just "forgotten cleanup"—they're **architectural failures** where object lifetimes are unintentionally extended beyond their intended scope. Understanding V8's heap architecture reveals *why* certain patterns cause leaks and *why* specific solutions work.

## The Core Problem: Unexpected Retention

V8's garbage collector tracks object reachability, not developer intent. If an object is reachable via any reference chain, it's alive—regardless of whether your business logic says it should be.

```
Leak Mechanism:

Intent:     Object X should die after request completes
            ─────────────────────────────────────────→

Reality:    Object X ←──── closure ────── handler ←─ event emitter
            (reachable)    captures       retained    (never removed)

            V8 GC sees: Object X is reachable
            Result: X stays alive indefinitely
```

## Pattern 1: Global Scope Anchors

### Why It Happens (Architecture)

Global variables are roots in V8's reference graph. GC starts from roots (global object, stack frames) and marks all reachable objects. Globals are **always reachable**.

```javascript
// ARCHITECTURE: Global object is a GC root
// global leak = permanent leak

// Pattern: Implicit global
function processData(data) {
    result = processLargeData(data);  // 'result' becomes global
    return result;
}

// Pattern: Global cache without bounds
const cache = {};  // Attached to global object

// Every entry in this cache is a GC root
// Entries survive until process restart
```

### Architectural Solution

```javascript
// SOLUTION 1: Module scope (not global)
const cache = new Map();  // Module-level, not global
                        // Dies when module dies (process restart)

// SOLUTION 2: Explicit lifecycle with WeakMap
const cache = new WeakMap();  // Keys eligible for GC when no refs exist

// SOLUTION 3: Limiting wrapper
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
            this.#cache.delete(firstKey);  // LRU eviction
        }
        this.#cache.set(key, value);
    }
}
```

## Pattern 2: Closure Capture Chains

### Why It Happens (Architecture)

Closures in V8 create a **scope chain** that GC must trace. Each closure captures its entire lexical environment—not just the variables it uses.

```javascript
// ARCHITECTURE: Closures create persistent scope chains

function createHandler() {
    const largeBuffer = new Array(10_000_000);  // 80MB
    
    // This closure captures: largeBuffer, someService, config
    return function handler(request) {
        return someService.process(request, largeBuffer);
    };
}

// Scope chain: handler → createHandler's scope → module scope → ...
// largeBuffer stays reachable as long as handler exists
```

### The Hidden Class Interaction

```javascript
// Even worse: closure prevents Map space optimization
class RequestHandler {
    #largeData;
    #map;  // Hidden class tracks property shapes
    
    constructor(data) {
        this.#largeData = data;  // Large buffer in object
    }
    
    createCallback() {
        // This closure keeps 'this' alive
        // V8 can't optimize away #largeData even if never used
        return (result) => {
            return this.#largeData[0];  // Captures entire object
        };
    }
}
```

### Architectural Solution

```javascript
// SOLUTION 1: Extract only what you need
function createHandler() {
    const largeBuffer = new Array(10_000_000);
    
    // Only capture the specific data needed
    const processFn = largeBuffer.process.bind(largeBuffer);
    
    return function handler(request) {
        return processFn(request);  // Don't capture largeBuffer
    };
}

// SOLUTION 2: Explicit dereferencing
function createHandler() {
    const largeBuffer = new Array(10_000_000);
    const handler = function handler(request) {
        return largeBuffer[0];  // Intentional capture
    };
    
    // Return cleanup function
    handler.destroy = () => {
        largeBuffer.length = 0;  // Release memory
    };
    
    return handler;
}

// SOLUTION 3: Use WeakRef for optional large data
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

## Pattern 3: Event Emitter Leaks

### Why It Happens (Architecture)

Event emitters create a **bidirectional reference graph**: listeners hold references to their emitters (via `this`), and emitters hold references to listeners.

```javascript
// ARCHITECTURE: Bidirectional retention
emitter.on('event', handler);
    │
    ├── emitter holds: Map<event, Set<handler>>
    │
    └── handler closure holds: this (emitter reference)

If emitter lives forever but handler should be temporary...
handler (and its closure scope) lives forever too.
```

### The Classic Accumulation Pattern

```javascript
// BAD: Each call adds a listener, none removed
class RequestProcessor {
    #emitter = new EventEmitter();
    
    processRequests() {
        // Listeners accumulate with each call
        this.#emitter.on('data', (data) => {
            this.handleData(data);  // 'this' keeps processor alive
        });
    }
}

// Each processRequests() call:
// 1. Creates new closure
// 2. Closure captures 'this' (entire RequestProcessor)
// 3. Listener added to emitter
// 4. Processor can never be GC'd while emitter lives
```

### Architectural Solution

```javascript
// SOLUTION 1: AbortController pattern (modern)
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
        this.#aborts.abort();  // Removes all registered listeners
    }
}

// SOLUTION 2: Explicit listener lifecycle
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

// SOLUTION 3: Once for transient handlers
function onFirstData(emitter, handler) {
    emitter.once('data', (data) => {
        handler(data);
    });  // Auto-removed after first invocation
}
```

## Pattern 4: Timer Anchoring

### Why It Happens (Architecture)

`setInterval`/`setTimeout` create a **root reference** that the timer system holds. The callback—and everything it captures—remains reachable until the timer is cleared or the process exits.

```javascript
// ARCHITECTURE: Timer system holds references
globalTimers.add(timerId, callback);
    │
    └── callback closure captured
            │
            └── Everything callback references stays alive

// Timer not cleared = closure scope lives forever
```

### Accumulation via Closures

```javascript
// BAD: Closure + interval = memory growth
function startProcessing() {
    const data = loadLargeData();  // Captured by interval
    
    setInterval(() => {
        processData(data);  // data stays alive
    }, 1000);
}

// Each call to startProcessing():
// 1. Creates new large data array
// 2. Creates interval referencing that data
// 3. Interval lives forever (never cleared)
// 4. All data arrays accumulate
```

### Architectural Solution

```javascript
// SOLUTION 1: Self-clearing timer with counter
function startProcessing(maxIterations = 100) {
    let count = 0;
    
    const interval = setInterval(() => {
        const data = loadLargeData();  // Fresh each iteration
        processData(data);
        
        if (++count >= maxIterations) {
            clearInterval(interval);  // Auto-cleanup
        }
    }, 1000);
    
    return interval;  // Caller responsible for cleanup
}

// SOLUTION 2: Use WeakRef for cached data
function startProcessing() {
    const cacheRef = new WeakRef(new Map());
    
    return setInterval(() => {
        const cache = cacheRef.deref();
        if (!cache) {
            // Cache was GC'd, recreate
            cacheRef = new WeakRef(new Map());
        }
        // Work with potentially-gone cache
    }, 1000);
}

// SOLUTION 3: Singleton pattern for shared resources
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

## Pattern 5: Unbounded Cache Growth

### Why It Happens (Architecture)

Maps and Sets in JavaScript have no eviction semantics. A `Map` used as a cache grows indefinitely because every entry is **strongly reachable**.

```
ARCHITECTURE: Cache as GC retention problem

Cache entry lifecycle:
1. cache.set(key, value) → entry added
2. Entry is strongly reachable via Map's internal storage
3. No automatic removal
4. Value stays alive as long as key is in Map

If cache grows forever → Old Space grows forever → OOM
```

### The Hidden Cost of Caching

```javascript
// BAD: Cache without eviction
const cache = new Map();

function getUser(id) {
    if (!cache.has(id)) {
        cache.set(id, loadUserFromDB(id));  // Each user stays forever
    }
    return cache.get(id);
}

// After 1 million requests:
// - 1 million User objects in Old Space
// - All survive every Major GC
// - Memory grows monotonically
```

### Architectural Solutions

```javascript
// SOLUTION 1: LRU Cache (bounded by design)
class LRUCache {
    #maxSize;
    #map = new Map();
    
    constructor(maxSize = 100) {
        this.#maxSize = maxSize;
    }
    
    get(key) {
        if (!this.#map.has(key)) return undefined;
        
        // Move to end (most recently used)
        const value = this.#map.get(key);
        this.#map.delete(key);
        this.#map.set(key, value);
        return value;
    }
    
    set(key, value) {
        if (this.#map.has(key)) {
            this.#map.delete(key);
        } else if (this.#map.size >= this.#maxSize) {
            // Remove least recently used (first item)
            const firstKey = this.#map.keys().next().value;
            this.#map.delete(firstKey);
        }
        this.#map.set(key, value);
    }
}

// SOLUTION 2: TTL-based expiration
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

// SOLUTION 3: WeakMap for object-keyed caches
const objectCache = new WeakMap();  // Values GC'd when keys are GC'd

function processObject(obj) {
    if (!objectCache.has(obj)) {
        objectCache.set(obj, expensiveOperation(obj));
    }
    return objectCache.get(obj);
}
// obj must be manually dereferenced to release cached value
```

## Pattern 6: Promise Chain Retention

### Why It Happens (Architecture)

Promises create implicit reference chains. A pending promise holds references to:
1. Its `then` callbacks (closure scope)
2. Variables captured by those callbacks
3. The rejection handlers

```javascript
// ARCHITECTURE: Promise retention model
async function process(data) {
    const context = createHeavyContext(data);  // Large object
    
    return fetch(url)
        .then(response => {
            return processWithContext(context, response);
        })
        .catch(error => {
            // This closure also captures context
            handleError(context, error);
        });
}

// Promise chain lifecycle:
// 1. async function returns Promise (chain starts)
// 2. fetch() promise created
// 3. .then() creates intermediate promise
// 4. .catch() creates another promise
// 5. ALL closures captured until chain resolves/rejects
```

### Cleanup vs. Retention

```javascript
// PROBLEM: Promise chain keeps context alive
async function processWithRetry(data, maxRetries = 3) {
    const context = new LargeContext(data);  // 50MB
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fetch(url)
                .then(r => r.json())
                .then(result => processResult(context, result));
        } catch (e) {
            // Retry: context stays alive across iterations
        }
    }
    
    // Context lives through entire retry loop
    // Only released after final attempt or success
}
```

### Architectural Solutions

```javascript
// SOLUTION 1: Explicit nulling after use
async function process(data) {
    const context = createHeavyContext(data);
    try {
        const result = await fetch(url).then(r => r.json());
        return processResult(context, result);
    } finally {
        // Explicit release after await completes
        context = null;
    }
}

// SOLUTION 2: Structured error handling (avoid catch chains)
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
    
    context.cleanup();  // Explicit cleanup
    return processResult(context, result);
}

// SOLUTION 3: AbortController with timeout
async function process(data, timeoutMs = 5000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(url, { signal: controller.signal });
        return await response.json();
    } finally {
        clearTimeout(timeout);
        // Context auto-released if fetch was aborted
    }
}
```

## Pattern 7: Native Module References

### Why It Happens (Architecture)

Addons (native modules) use `node-gyp` and interact with V8's heap via **external resources**. V8 doesn't manage these directly—they're held by the native code.

```javascript
// ARCHITECTURE: External resource management
const addon = require('./native-addon');

// External resources:
addon.createBuffer(1024 * 1024);  // C++ heap, not V8 heap
    │
    └── Tracked by: addon._exernalMemory
            │
            └── Increases process.memoryUsage().external
            └── NOT collected by V8 GC
```

### Buffer Retention in Addons

```javascript
// Typical leak pattern in addons
class NativeProcessor {
    #buffers = [];
    
    process(data) {
        // Buffer created in C++, stored in JS array
        const buffer = this.#native.createBuffer(data);
        this.#buffers.push(buffer);  // Explicit retention
        
        // Even if buffer is freed in C++,
        // JS array entry keeps it alive in V8 heap
    }
}
```

### Architectural Solutions

```javascript
// SOLUTION 1: Track and release explicitly
class NativeProcessor {
    #buffers = [];
    #native;
    
    constructor() {
        this.#native = require('./native-addon');
    }
    
    process(data) {
        const buffer = this.#native.createBuffer(data);
        this.#buffers.push(buffer);
        
        // Return cleanup function
        return () => {
            this.#native.releaseBuffer(buffer);
            const idx = this.#buffers.indexOf(buffer);
            if (idx >= 0) this.#buffers.splice(idx, 1);
        };
    }
    
    destroy() {
        // Release all buffers
        for (const buffer of this.#buffers) {
            this.#native.releaseBuffer(buffer);
        }
        this.#buffers = [];
    }
}

// SOLUTION 2: Monitor external memory
setInterval(() => {
    const { heapUsed, heapTotal, external } = process.memoryUsage();
    
    const externalRatio = external / (heapUsed + external);
    
    if (externalRatio > 0.5) {
        console.error('External memory > 50% of total. Potential addon leak.');
        // Trigger cleanup or alert
    }
}, 10000);
```

## Diagnostic Architecture

### Heap Snapshot Analysis

```javascript
// Architecture: Snapshot captures reference graph at point in time
const v8 = require('v8');
const fs = require('fs');

function captureSnapshot(filename = 'heap.heapsnapshot') {
    const filepath = v8.writeHeapSnapshot(filename);
    console.log(`Snapshot: ${filepath}`);
    return filepath;
}

// Key insight: Compare snapshots over time
// Leaked objects appear in later snapshots but not earlier
// Retained size shows WHY objects are kept (path to GC root)
```

### Memory Growth Pattern Recognition

```javascript
// Architecture: Identify leak by growth pattern
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

// Usage
const monitor = new MemoryMonitor();
monitor.start();

setTimeout(() => {
    const analysis = monitor.analyze();
    console.log(analysis);
    monitor.stop();
}, 60000);
```

### Leak Indicators by GC Phase

| Indicator | Likely Cause | GC Phase Affected |
|-----------|-------------|-------------------|
| `heapUsed` monotonic growth | Unbounded retention | Both |
| Growth stops after Major GC | Young space promotion issue | Minor GC |
| No growth plateau | Global leak (roots) | Major GC |
| `external` increasing | Native addon retention | N/A |

## Architectural Prevention Framework

### Design for Explicit Lifecycle

```javascript
// Every object should have clear ownership
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

### Memory Budgeting

```javascript
// Architecture: Budget-driven resource management
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

## Leak Prevention Checklist

### Architecture Review Questions

- [ ] **Scope Anchoring**: Are objects attached to global/module scope only when truly global?
- [ ] **Closure hygiene**: Do closures capture only what's necessary?
- [ ] **Event lifecycle**: Are listeners removed when their source is destroyed?
- [ ] **Timer discipline**: Are all timers cleared in cleanup paths?
- [ ] **Cache bounds**: Do caches have eviction policies?
- [ ] **Promise awareness**: Do promise chains hold references past their usefulness?
- [ ] **Native cleanup**: Do addon resources have explicit release methods?
- [ ] **Memory budgets**: Are there limits on in-memory structures?

### Code Review Signals

```javascript
// RED FLAGS (architectural debt):
new Array()           // No size limit
new Map()              // No eviction
.push() in loop        // Potential accumulation
setInterval without    // No clear cleanup path
  clearInterval
.on() without .off()   // Listener accumulation
global variable        // Permanent retention
new Promise() stored   // Chain retained indefinitely
```

## Related

- [Heapdump Analysis](./heapdump-analysis.md) - Debugging techniques
- [V8 Heap Structure](./v8-heap-structure.md) - Architectural foundation
- [Scavenge Algorithm](./scavenge-algorithm.md) - Minor GC behavior
- [Mark-Sweep-Compact](./mark-sweep-compact.md) - Major GC behavior
