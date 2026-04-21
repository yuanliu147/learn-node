# Heapdump Analysis

## Overview

Heapdump analysis is a critical technique for debugging memory leaks and understanding object retention in Node.js/V8 applications. This guide covers generating and analyzing heap snapshots.

## Generating Heap Dumps

### Method 1: Programmatic (v8 module)

```javascript
const v8 = require('v8');
const fs = require('fs');

// Generate heap snapshot
const filename = v8.writeHeapSnapshot();
// Default filename: heapdump-<pid>-<timestamp>.heapsnapshot

// Custom filename
const snapshot = v8.writeHeapSnapshot('./my-app.heapsnapshot');
console.log('Snapshot saved to:', snapshot);
```

### Method 2: Signal-based

```bash
# Send SIGUSR2 to running process
kill -USR2 <pid>

# Or use Node's --heapsnapshot-signal flag
node --heapsnapshot-signal=SIGUSR2 server.js
```

### Method 3: Chrome DevTools

1. Open Chrome and navigate to `chrome://inspect`
2. Click "Open dedicated DevTools for Node"
3. Go to Memory tab
4. Take heap snapshot

### Method 4: External Tools

```bash
# Using heapdump npm package
npm install heapdump

# Then in code:
const heapdump = require('heapdump');
heapdump.writeSnapshot('./heapsnapshot.heapsnapshot');
```

## Analyzing Heap Snapshots

### Chrome DevTools Analysis

#### Open Snapshot
1. Open Chrome DevTools (F12)
2. Go to Memory tab
3. Load snapshot file via "Load" button

#### Key Views

**1. Summary View**
- Groups objects by constructor name
- Shows shallow size (object's own memory)
- Shows retained size (memory freed if object removed)
- Useful for finding largest objects

```
Constructor (class) | Count | Shallow Size | Retained Size
─────────────────────────────────────────────────────────
Object              | 12345 | 1.2 MB       | 50 MB
Array               | 5000  | 800 KB       | 20 MB
String              | 25000 | 2.5 MB       | 2.5 MB
```

**2. Comparison View**
- Compare two snapshots
- Shows what's changed between snapshots
- Great for detecting memory growth

**3. Containment View**
- Shows object graph structure
- Explore references between objects
- Find root cause of retention

**4. Statistics View**
- Pie chart of memory distribution
- By type (strings, arrays, objects, etc.)
- By space (old space, new space, code space)

### Retention Path Analysis

Finding why an object is retained:

```
1. Select object in snapshot
2. Right-click → "Select kept objects alive by this object"
3. See retainer chain (why object can't be GC'd)

Typical retainer types:
- Closures (JS closures capturing variables)
- Elements (DOM nodes)
- Event listeners
- Global handles
- Stack roots
```

### Allocation Timeline

Track where objects are created:

```javascript
// Start recording allocation timeline
// In DevTools Memory tab:
// 1. Select "Allocation instrumentation on timeline"
// 2. Start recording
// 3. Perform actions
// 4. Stop recording

// Blue bars: still alive at end
// Gray bars: garbage collected
```

## Common Leak Patterns in Snapshots

### Pattern 1: Detached DOM Tree

```
# Find detached DOM nodes:
1. Filter by "Detached" in summary
2. Look for HTMLDivElement, HTMLTableElement, etc.
3. Check what's retaining them (usually event listeners)
```

### Pattern 2: Closure Retention

```
# Identify closures retaining large data:
1. Find objects with function constructors
2. Expand to see "Properties" section
3. Look for "scope" or captured variables
4. Check "Average" and "Max" snapshot sizes
```

### Pattern 3: Global Cache Growth

```
# Detect unbounded caches:
1. Compare snapshots over time
2. Look for Map/Set objects with growing counts
3. Find @Symbol keys or numeric indices
```

### Pattern 4: Event Listener Accumulation

```
# Find accumulated listeners:
1. Filter by "EventListener" or listener names
2. See "Distance" column (how far from root)
3. Listeners with low distance but high count = leak
```

## Heapdump CLI Analysis

### heapdiff

Compare two heap snapshots:

```bash
npm install -g heapdump
heapsnap heapdump1.heapsnapshot heapdump2.heapsnapshot
```

### node-heapdump

```javascript
const heapdump = require('heapdump');

// Signal-based snapshot
process.on('SIGUSR2', () => {
    heapdump.writeSnapshot((err, filename) => {
        if (err) console.error(err);
        else console.log('Heap snapshot:', filename);
    });
});
```

## Analyzing with JavaScript API

### v8.HeapSpaceStatistics

```javascript
const v8 = require('v8');

setInterval(() => {
    const stats = v8.getHeapSpaceStatistics();
    console.log('\nHeap Space Statistics:');
    stats.forEach(space => {
        console.log(`${space.space_name}:`);
        console.log(`  Space size: ${Math.round(space.space_size / 1024 / 1024)}MB`);
        console.log(`  Used: ${Math.round(space.space_used_size / 1024 / 1024)}MB`);
        console.log(`  Available: ${Math.round(space.space_available_size / 1024 / 1024)}MB`);
    });
}, 5000);
```

### v8.GCProfiler (Experimental)

```javascript
const v8 = require('v8');

// Start GC profiling
const profiler = new v8.GCProfiler();
profiler.start();

// ... run your code ...

// Get GC profile data
const profile = profiler.stop();
console.log(JSON.stringify(profile, null, 2));
```

## Heap Snapshot File Format

The `.heapsnapshot` file is JSON with these top-level entries:

```json
{
    "snapshot": {
        "meta": { /* node type metadata */ },
        "node_count": 12345,
        "edge_count": 50000
    },
    "nodes": [ /* node type + address + size + edge indices */ ],
    "edges": [ /* edge type + from + to + name */ ],
    "trace_functions": [ /* stack traces if enabled */ ],
    "trace_tree": [ /* allocation sites */ ],
    "strings": [ /* string table */ ]
}
```

## Tips for Effective Analysis

### 1. Take Multiple Snapshots

```javascript
// At key points in your application lifecycle:
v8.writeHeapSnapshot('./snapshot-start.heapsnapshot');
// ... run app ...
v8.writeHeapSnapshot('./snapshot-middle.heapsnapshot');
// ... identify leak ...
v8.writeHeapSnapshot('./snapshot-end.heapsnapshot');
```

### 2. Force GC Before Snapshot

```javascript
// For accurate snapshot:
if (global.gc) {
    global.gc();
}
v8.writeHeapSnapshot();
```

### 3. Isolate the Problem

```javascript
// Create minimal reproduction:
async function reproduce() {
    // Trigger memory growth
    // Take snapshot
}
// Run isolated to reduce noise
```

### 4. Use Allocation Stack Traces

```bash
# Enable stack trace recording
node --stack-trace-limit=50 app.js

# In DevTools, right-click function → "Save as profile with heap information"
```

## Common Commands Reference

```bash
# Generate snapshot via signal
kill -USR2 $(pgrep -f "node.*server.js")

# Load snapshot automatically in Chrome
google-chrome heapdump-1234-5678.heapsnapshot

# Compare snapshots with heapdiff
heapdiff snapshot1.heapsnapshot snapshot2.heapsnapshot

# List snapshots
ls -la heapdump*.heapsnapshot
```

## Related

- [Memory Leak Patterns](./memory-leak-patterns.md) - Common causes
- [V8 Heap Structure](./v8-heap-structure.md) - Memory layout
- [Object Layout](./object-layout.md) - Object representation
