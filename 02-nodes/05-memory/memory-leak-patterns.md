# Memory Leak Patterns in Node.js/V8

## Overview

Memory leaks in Node.js applications occur when objects are retained in memory longer than expected, gradually consuming available heap until performance degrades or the process crashes.

## Common Leak Patterns

### 1. Global Variables

```javascript
// BAD: Accidentally creating globals
function processData(data) {
    result = processLargeData(data);  // Missing 'const/let/var'
    return result;
}

// BAD: Using global for caching without limits
const cache = {};
function getData(key) {
    if (!cache[key]) {
        cache[key] = expensiveOperation(key);
    }
    return cache[key];
}
```

**Solution**: Use `const`/`let`, implement cache with size limits or TTL

### 2. Closures

```javascript
// BAD: Closure retaining large objects
function createHandler() {
    const largeData = loadLargeData();  // 100MB
    
    return function handler() {
        // 'largeData' is captured and never released
        return largeData.process();
    };
}

const handler = createHandler();
// largeData cannot be GC'd as long as handler exists
```

**Solution**: Null out references when done, or avoid capturing large objects in closures

### 3. Event Listeners

```javascript
// BAD: Adding listeners without removal
function processRequests() {
    const server = createServer();
    
    server.on('connection', (conn) => {
        conn.on('data', handleData);
        // Listeners accumulate with each 'processRequests' call
    });
}

// BAD: 'this' context leak
class Handler {
    constructor() {
        this.data = new LargeBuffer();  // 50MB
    }
    
    setup() {
        document.addEventListener('click', () => {
            // 'this' retains 'data' buffer
            this.process();
        });
    }
}
```

**Solution**: Remove listeners with `removeListener`, use `{ once: true }`, or use AbortController

### 4. Timers and Callbacks

```javascript
// BAD: setInterval holding references
function startProcessing() {
    setInterval(() => {
        processData(loadData());  // Data accumulates
    }, 1000);
}

// BAD: Timer not cleared
const timer = setInterval(() => {
    cache.push(expensiveOperation());
}, 100);
// If timer never cleared, cache grows forever
```

**Solution**: Always `clearInterval`/`clearTimeout`, use WeakRef for optional callbacks

### 5. Caches Without Eviction

```javascript
// BAD: Unbounded cache
const cache = new Map();

function getUser(id) {
    if (!cache.has(id)) {
        cache.set(id, loadUserFromDB(id));
    }
    return cache.get(id);
}
// Cache grows indefinitely
```

**Solution**: Use LRU cache, TTL-based expiration, or `WeakMap` for object keys

### 6. Closures with DOM References (Hybrid Apps)

```javascript
// In native addons or Electron renderer:
const largeBuffer = createLargeBuffer();

// BAD: Closure capturing buffer in C++ callback
someNativeModule.on('data', () => {
    useBuffer(largeBuffer);  // Buffer retained
});
```

### 7. Scope Retention via Promises

```javascript
// BAD: Promise chain retaining scope
async function processWithRetries(data) {
    const context = createHeavyContext(data);  // 20MB
    
    return fetch(url)
        .then(() => doWork(context))
        .then(() => cleanup(context));  // Only runs on success
        
    // If promise chain is retained, context stays alive
}
```

**Solution**: Use `try/finally`, or avoid chaining when possible

### 8. Detached DOM Nodes

```javascript
// BAD: Removing DOM node but keeping reference
const myDiv = document.getElementById('myDiv');
myDiv.parentNode.removeChild(myDiv);
// 'myDiv' still referenced in code, DOM tree can't be GC'd
```

### 9. Circular References

```javascript
// In V8, circular references are typically handled correctly
// But can cause issues with older engines or C++ references:
class Node {
    constructor() {
        this.next = null;
        this.data = new LargeArray();
    }
}

const a = new Node();
const b = new Node();
a.next = b;  // a → b
b.next = a;  // b → a (circular)

// External reference keeps both alive
```

**Note**: V8's GC handles circular references correctly with mark-and-sweep. This is only an issue with reference-counting collectors.

## Diagnostic Patterns

### Heap Snapshot Analysis

```javascript
// Take heap snapshot programmatically
const v8 = require('v8');
const fs = require('fs');

// Trigger snapshot
const snapshot = v8.writeHeapSnapshot();
console.log('Snapshot written to:', snapshot);

// Or use --heapsnapshot signal
// kill -USR2 <pid>
```

### Memory Growth Detection

```javascript
const v8 = require('v8');
const startUsage = process.memoryUsage();

setInterval(() => {
    const current = process.memoryUsage();
    const growth = current.heapUsed - startUsage.heapUsed;
    
    console.log({
        heapUsed: Math.round(current.heapUsed / 1024 / 1024) + 'MB',
        growth: Math.round(growth / 1024 / 1024) + 'MB'
    });
}, 5000);
```

### Leak Indicators

- `heapUsed` grows monotonically without plateau
- GC not reclaiming significant memory
- `externalMemory` increasing (C++ objects)
- Memory stays high after explicit `global.gc()`

## Prevention Strategies

### 1. Use WeakMap/WeakRef

```javascript
// WeakMap: keys (objects) can be GC'd when no other refs exist
const cache = new WeakMap();

// WeakRef: allows GC of object while providing access
const largeObject = new LargeObject();
const weakRef = new WeakRef(largeObject);
// Can still access with weakRef.deref()
```

### 2. Explicit Cleanup

```javascript
class ResourceHandler {
    #cleanup() {
        this.data = null;
        this.listeners = [];
        clearInterval(this.timer);
    }
    
    destroy() {
        this.#cleanup();
    }
}
```

### 3. Object Pooling

```javascript
// Reuse objects instead of creating new ones
class BufferPool {
    #pool = [];
    
    acquire() {
        return this.#pool.pop() || new Buffer();
    }
    
    release(buffer) {
        buffer.fill(0);  // Clear sensitive data
        this.#pool.push(buffer);
    }
}
```

### 4. Monitor External Memory

```javascript
setInterval(() => {
    const { heapUsed, heapTotal, external } = process.memoryUsage();
    console.log({
        heapUsed: `${Math.round(heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(external / 1024 / 1024)}MB`
    });
    
    if (external > heapTotal * 0.5) {
        console.warn('High external memory usage');
    }
}, 10000);
```

## Memory Leak Checklist

- [ ] Are event listeners removed when no longer needed?
- [ ] Are timers cleared when components unmount?
- [ ] Do caches have eviction policies?
- [ ] Are closures not capturing unnecessary large objects?
- [ ] Are global variables minimized?
- [ ] Are circular references through C++ handles avoided?
- [ ] Is there a memory limit set (`--max-old-space-size`)?

## Related

- [Heapdump Analysis](./heapdump-analysis.md) - Debug techniques
- [V8 Heap Structure](./v8-heap-structure.md) - Memory layout
- [Scavenge Algorithm](./scavenge-algorithm.md) - GC basics
