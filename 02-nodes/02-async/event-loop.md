# Node.js Event Loop

## Overview

The event loop is what allows Node.js to perform non-blocking I/O operations despite JavaScript being single-threaded. It's a continuous cycle that processes events/callbacks from an event queue.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                          Timers                              │
│                   setTimeout, setInterval                    │
│                           │                                  │
│                           ▼                                  │
│              ┌─────────────────────────┐                     │
│              │    Pending Callbacks    │                     │
│              │  (I/O callbacks deferred)│                    │
│              └────────────┬────────────┘                     │
│                           │                                  │
│                           ▼                                  │
│              ┌─────────────────────────┐                     │
│              │    Idle, Prepare        │                     │
│              │     (internal use)      │                     │
│              └────────────┬────────────┘                     │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                      Poll                             │    │
│  │  (retrieve new I/O events, execute I/O callbacks)    │    │
│  │                                                         │    │
│  │  If no callbacks → check if timers due → or wait     │    │
│  └─────────────────────────┬───────────────────────────┘    │
│                            │                                 │
│                            ▼                                 │
│              ┌─────────────────────────┐                     │
│              │         Check           │                     │
│              │     setImmediate()       │                     │
│              └────────────┬────────────┘                     │
│                           │                                  │
│                           ▼                                  │
│              ┌─────────────────────────┐                     │
│              │    Close Callbacks      │                     │
│              │   (socket.on('close'))  │                     │
│              └─────────────────────────┘                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Phases Overview

| Phase | Description | Typical Callbacks |
|-------|-------------|-------------------|
| **Timers** | Executes callbacks scheduled by `setTimeout()` and `setInterval()` | Timers callbacks |
| **Pending Callbacks** | I/O callbacks deferred from previous loop iteration | I/O errors |
| **Idle, Prepare** | Internal use only | Internal |
| **Poll** | Retrieves new I/O events, executes most callbacks | I/O, networking, etc. |
| **Check** | Executes `setImmediate()` callbacks | setImmediate |
| **Close Callbacks** | Handles close events | socket.on('close') |

## Key Concepts

### Single Threaded

JavaScript runs on a single thread. The event loop coordinates tasks but doesn't execute JavaScript itself - the V8 engine does.

### Non-Blocking I/O

Node.js uses asynchronous I/O operations managed by libuv. When you perform async I/O:
1. The operation is delegated to libuv
2. JavaScript continues executing
3. When complete, the callback is queued

### Queue Types

```
┌─────────────────────┐    ┌─────────────────────┐
│      Macrotasks     │    │     Microtasks      │
│       (Tasks)       │    │    (Jobs)           │
├─────────────────────┤    ├─────────────────────┤
│ setTimeout          │    │ Promise callbacks   │
│ setInterval         │    │ queueMicrotask()    │
│ setImmediate        │    │ MutationObserver    │
│ I/O callbacks       │    │                    │
│ UI rendering        │    │                    │
└─────────────────────┘    └─────────────────────┘
```

**Important**: Microtasks have higher priority than macrotasks.

## Phase Details

### Timers Phase

- Executes callbacks scheduled with `setTimeout()` and `setInterval()`
- Order: FIFO (first scheduled, first executed)
- Timing is **not exact** - "after at least X ms", not "after exactly X ms"

```javascript
setTimeout(() => console.log('timeout 1'), 100);
setTimeout(() => console.log('timeout 2'), 50);

// Output order depends on when the event loop reaches timers phase
// and when each timer expires
```

### Poll Phase

The most complex phase:

1. **If there are callbacks in the queue**: Process them all FIFO
2. **If no callbacks**: 
   - If there are `setImmediate()` callbacks → move to Check phase
   - If there are timer callbacks due → move to Timers phase
   - Otherwise, wait for new I/O events

```javascript
const fs = require('fs');

// This might run in poll or check phase
fs.readFile(__filename, () => {
  console.log('readFile callback');
});
```

### Check Phase

- Executes `setImmediate()` callbacks
- Only runs if there are no I/O callbacks being processed or after poll phase is empty

```javascript
setImmediate(() => console.log('immediate'));
setTimeout(() => console.log('timeout'), 0);

// Which runs first? It depends!
// Generally: I/O callbacks first, but timers are unpredictable for 0ms
```

## Process.nextTick() vs setImmediate()

### process.nextTick()

- Not technically part of the event loop
- Adds callback to a special queue processed **immediately after** current operation completes
- Before moving to next event loop phase
- Higher priority than Promises/microtasks

```javascript
console.log('1');

process.nextTick(() => console.log('3'));

Promise.resolve().then(() => console.log('4'));

console.log('2');

// Output: 1, 2, 3, 4
```

### setImmediate()

- Part of the event loop's "check" phase
- Runs after I/O callbacks are exhausted
- Execute after poll phase

```javascript
const fs = require('fs');

fs.readFile(__filename, () => {
  console.log('readFile callback');
  
  setImmediate(() => console.log('immediate'));
  process.nextTick(() => console.log('nextTick'));
  
  console.log('sync code');
});

// Output:
// sync code
// nextTick
// readFile callback
// immediate
```

### Comparison Table

| Aspect | process.nextTick() | setImmediate() |
|--------|-------------------|----------------|
| Phase | After current operation (before next phase) | Check phase |
| Guaranteed order | Before Promise callbacks | After I/O callbacks |
| Use case | Defer execution but need it soon | Defer after I/O complete |
| Can block event loop | Yes (if abused) | No |

## Execution Order Demo

```javascript
console.log('1: start');

setTimeout(() => console.log('2: timeout 0'), 0);
setTimeout(() => console.log('3: timeout 100'), 100);

setImmediate(() => console.log('4: immediate'));

process.nextTick(() => console.log('5: nextTick'));

Promise.resolve()
  .then(() => console.log('6: promise then'));

console.log('7: end');

// Typical output:
// 1: start
// 7: end
// 5: nextTick
// 6: promise then
// 2: timeout 0
// 4: immediate (sometimes before 2, sometimes after)
// 3: timeout 100
```

## setTimeout(fn, 0) vs setImmediate()

They often run in different orders depending on context:

```javascript
// Case 1: Inside I/O callback
fs.readFile('/etc/passwd', () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
});

// Output order is predictable:
// immediate ALWAYS runs before timeout

// Case 2: Outside any I/O
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));

// Output order is NOT predictable
// Depends on process startup time and timer granularity
```

## Common Patterns

### Blocking the Event Loop

Never do CPU-intensive work directly - it blocks everything:

```javascript
// BAD - blocks event loop
function badFibonacci(n) {
  if (n <= 1) return n;
  return badFibonacci(n - 1) + badFibonacci(n - 2);
}

// GOOD - use Worker Threads or break up work
const { Worker } = require('worker_threads');
```

### Cooperative Scheduling with nextTick

```javascript
function processLargeArray(arr, callback) {
  let index = 0;
  
  function process() {
    const chunk = 1000;
    const end = Math.min(index + chunk, arr.length);
    
    for (let i = index; i < end; i++) {
      // Process item
    }
    
    index = end;
    
    if (index < arr.length) {
      process.nextTick(process); // Yield to event loop
    } else {
      callback();
    }
  }
  
  process();
}
```

## Node.js Event Loop in Browser Context

In browsers, the event loop is simpler:

```
┌────────────────────────────┐
│         Tasks Queue        │
│   (macrotasks: setTimeout, │
│    setInterval, I/O)       │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│       Microtasks Queue     │
│  (Promise callbacks, etc.) │
└────────────────────────────┘
```

## libuv (Under the Hood)

Node.js uses libuv library to handle:
- Timers
- I/O callbacks
- Thread pool (for file system, DNS, crypto, etc.)

The thread pool size defaults to 4 (can be increased with `UV_THREADPOOL_SIZE`).

## Questions to Test Understanding

1. What order does `setTimeout`, `setImmediate`, and `process.nextTick` execute in?
2. What's the difference between the poll phase and check phase?
3. Why might `setTimeout(fn, 0)` not run before `setImmediate()`?
4. How does `process.nextTick` differ from other async patterns?

## Summary

- Node.js event loop has multiple phases: timers, pending callbacks, poll, check, close callbacks
- `process.nextTick()` runs before other async callbacks but is not part of the event loop proper
- `setImmediate()` runs in the check phase, after I/O callbacks
- Microtasks (Promises) run between phases
- Understanding event loop order is crucial for predictable async behavior
