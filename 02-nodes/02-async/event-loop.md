# Node.js Event Loop Architecture

## Design Philosophy

Node.js was designed to solve a fundamental problem: **building I/O-intensive applications that scale**. Traditional thread-per-connection models crumble under high concurrency due to memory overhead and context-switching costs. The event loop is the core mechanism enabling Node.js's alternative approach: **a single thread handling many concurrent operations through cooperative scheduling**.

The key insight is that most application time is spent waiting for I/O, not processing. Rather than dedicating a thread to each connection (blocking on wait), Node.js multiplexes many connections on a single thread, surrendering control during wait periods.

## Architectural Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Node.js Process                              │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                          V8 Engine                              │ │
│  │              JavaScript Code, JIT Compilation                   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                               │                                       │
│                    ┌──────────┴──────────┐                           │
│                    ▼                     ▼                           │
│  ┌─────────────────────────┐   ┌─────────────────────────┐          │
│  │      Node.js Core       │   │        libuv            │          │
│  │   (Bindings, C++ Addons)│◄──┤  (Event Loop, Thread   │          │
│  │                         │   │   Pool, I/O Multiplexing│          │
│  └─────────────────────────┘   └──────────┬──────────────┘          │
│                               │            │                         │
│                               ▼            ▼                         │
│                     ┌──────────────────────────────┐                 │
│                     │   Operating System           │                 │
│                     │  ( epoll, kqueue, IOCP )     │                 │
│                     └──────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Separation of Concerns:**
- **V8** executes JavaScript, manages memory, and handles the call stack
- **libuv** owns the event loop, abstracts OS-level I/O notifications, and manages the thread pool
- **Node.js bindings** bridge JavaScript APIs to libuv operations

This separation allows Node.js to remain portable across platforms while maintaining a consistent JavaScript API.

## The Event Loop Phases

The event loop is a state machine that cycles through distinct phases, each with a specific responsibility:

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

### Phase Responsibilities

| Phase | Purpose | Design Rationale |
|-------|---------|------------------|
| **Timers** | Execute timer callbacks | Allows scheduling; callbacks run "at least" after delay |
| **Pending Callbacks** | Run I/O errors/deferred callbacks | Ensures error handling without blocking the poll phase |
| **Idle, Prepare** | Internal libuv bookkeeping | Prepares for next iteration; not directly controllable |
| **Poll** | Process I/O events | The workhorse phase; where most async operations complete |
| **Check** | Execute `setImmediate()` callbacks | Enables immediate execution after poll exhaustion |
| **Close Callbacks** | Handle socket/handle close events | Clean shutdown of resources |

### Phase Transitions

```
Entry → Timers → Pending → Idle → Poll
                                      │
                         ┌────────────┤
                         │            │
                    (has callbacks)  (empty)
                         │            │
                         ▼            ▼
                       Poll        Check → Timers → ...
                                         │
                                    (if no immediate)
```

**Critical Design Decision**: The Poll phase has two behaviors depending on whether callbacks exist:
1. **Has callbacks**: Process them all (FIFO)
2. **Empty**: Check for `setImmediate()` (goto Check) or timers (goto Timers), else **block waiting for I/O**

This blocking-with-timeout mechanism allows efficient CPU usage—when there's nothing to do, Node.js sleeps rather than busy-waits.

## Queue Hierarchy and Priority Inversion

The event loop must reconcile competing priorities. The architecture solves this through a strict hierarchy:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Execution Hierarchy                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    Current Phase                         │   │
│   │   ┌─────────────────────────────────────────────────┐   │   │
│   │   │              Microtask Queue                     │   │   │
│   │   │   (Promises, queueMicrotask, MutationObserver)  │   │   │
│   │   └─────────────────────────────────────────────────┘   │   │
│   │                         │                               │   │
│   │                         ▼                               │   │
│   │   ┌─────────────────────────────────────────────────┐   │   │
│   │   │           nextTick Queue (HIGHEST)              │   │   │
│   │   │        (process.nextTick callbacks)             │   │   │
│   │   └─────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Execution Rule**: Between each phase transition, the **entire** microtask queue drains before proceeding. `process.nextTick()` callbacks drain **before** Promise callbacks.

This creates a subtle but important guarantee: any `process.nextTick()` callback runs before any Promise callback, regardless of insertion order.

## Non-Blocking I/O: The libuv Abstraction

libuv provides platform-agnostic I/O through a thread pool and OS-level event notification:

```
┌─────────────────────────────────────────────────────────────────┐
│                         libuv Architecture                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   JavaScript ──► Node Bindings ──► libuv                         │
│                                           │                      │
│                         ┌─────────────────┴─────────────────┐   │
│                         ▼                                   ▼   │
│              ┌────────────────────┐           ┌───────────────┐ │
│              │  I/O Multiplexing  │           │  Thread Pool  │ │
│              │   (event ports)    │           │  (4-1024)      │ │
│              ├────────────────────┤           ├───────────────┤ │
│              │  epoll (Linux)     │           │  fs operations │ │
│              │  kqueue (macOS)    │           │  DNS queries   │ │
│              │  IOCP (Windows)    │           │  crypto        │ │
│              └────────────────────┘           │  compression   │ │
│                                               └───────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Design Trade-off**: The thread pool handles operations that can't be expressed as file descriptor events (file I/O, DNS lookups, cryptographic operations). The pool size is configurable via `UV_THREADPOOL_SIZE` but maxes at 1024 to prevent resource exhaustion.

Operations expressible as file descriptor events (sockets, pipes) use OS-level multiplexing directly—no thread needed per connection.

## process.nextTick() vs setImmediate(): Architectural Intent

These two APIs serve distinct architectural purposes despite similar appearances:

### process.nextTick()

**Architectural Role**: Emergency exit valve for JavaScript

- Not part of the event loop proper—runs between operations
- Executes before the event loop continues to the next phase
- Use case: Ensuring something runs before the JavaScript engine can yield

```javascript
// Guarantees 'bar' runs before any other async operation
function foo() {
  process.nextTick(() => console.log('bar'));
}
```

**Warning**: Infinite `process.nextTick()` recursion blocks the event loop entirely since there's no phase boundary to break the cycle.

### setImmediate()

**Architectural Role**: Scheduling after I/O completion

- Part of the Check phase—runs after poll phase exhausts I/O callbacks
- Designed for "run after current I/O batch completes"
- Use case: Deferring work until the next event loop iteration after I/O

```javascript
fs.readFile('data.txt', () => {
  // All I/O callbacks for this batch are processed
  // Now we can safely schedule more work
  setImmediate(() => console.log('runs in next iteration'));
});
```

### Comparison

| Aspect | process.nextTick() | setImmediate() |
|--------|-------------------|----------------|
| Phase | After current JS operation | Check phase |
| Latency | Immediate (next tick) | Next iteration |
| Event loop blocking | Yes (if abused) | No (yields to event loop) |
| I/O context | No relationship | Designed for post-I/O |

## Execution Order: The Architecture in Practice

```
┌─────────────────────────────────────────────────────────────────┐
│                    Synchronous Code                              │
│                    (current call stack)                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 process.nextTick() callbacks                     │
│                 (drains before anything else async)              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Promise callbacks                             │
│                    (microtasks)                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Event Loop Phase 1...N                        │
│                    (Timers → Poll → Check → ...)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Real-World Execution Example

```javascript
console.log('1: sync start');

setTimeout(() => console.log('2: timeout 0'), 0);
setTimeout(() => console.log('3: timeout 100'), 100);

setImmediate(() => console.log('4: immediate'));

process.nextTick(() => console.log('5: nextTick'));

Promise.resolve().then(() => console.log('6: promise then'));

console.log('7: sync end');

// Output:
// 1: sync start
// 7: sync end
// 5: nextTick        ← nextTick before microtasks (by design)
// 6: promise then    ← microtasks drain here
// 2: timeout 0       ← timers phase
// 4: immediate       ← check phase (may interleave with timers)
// 3: timeout 100     ← later timers phase
```

## I/O Callback Timing: Why It Matters

The relationship between I/O and scheduling reveals the architecture's intent:

```javascript
// Case 1: Inside I/O callback
fs.readFile('/etc/passwd', () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
});
// Output: immediate ALWAYS before timeout
// Reason: Poll phase already passed; Check phase runs before next Timers

// Case 2: Outside I/O
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
// Output: UNPREDICTABLE
// Reason: Depends on process startup time, timer granularity, and event loop iteration timing
```

**Architectural Insight**: Within I/O callbacks, execution order becomes deterministic because the poll phase has already run. Outside I/O context, you race between timer scheduling and the event loop's current phase.

## Architectural Patterns

### 1. Non-Blocking Cooperative Multiplexing

```javascript
// BAD: Blocks entire event loop
function processAll(items) {
  for (const item of items) {
    cpuIntensiveWork(item); // No yielding
  }
}

// GOOD: Yields between chunks
async function processAll(items) {
  for (const item of items) {
    await yieldToEventLoop(); // Allows other operations
    cpuIntensiveWork(item);
  }
}

function yieldToEventLoop() {
  return new Promise(resolve => setImmediate(resolve));
}
```

### 2. Deferred Execution with setImmediate

```javascript
// Process large dataset without blocking
function processLargeArray(arr, callback) {
  let index = 0;
  
  function processChunk() {
    const chunk = 1000;
    const end = Math.min(index + chunk, arr.length);
    
    for (let i = index; i < end; i++) {
      processItem(arr[i]);
    }
    
    index = end;
    
    if (index < arr.length) {
      setImmediate(processChunk); // Schedule next chunk
    } else {
      callback();
    }
  }
  
  setImmediate(processChunk);
}
```

### 3. Ensuring Callbacks Run After I/O

```javascript
function afterIO(callback) {
  fs.readFile('dummy', () => {
    callback();
  });
}

// vs.

function afterIO(callback) {
  process.nextTick(callback); // WRONG: Runs before I/O completes
}

function afterIO(callback) {
  setImmediate(callback); // RIGHT: Runs in next iteration
}
```

## Browser Event Loop: Architectural Comparison

Browsers implement a simplified event loop model:

```
┌────────────────────────────┐
│         Tasks Queue        │
│   (setTimeout, setInterval,│
│    I/O callbacks)          │
└──────────┬─────────────────┘
           │
           ▼ (drain all microtasks)
┌────────────────────────────┐
│       Microtasks Queue     │
│  (Promise callbacks, etc.) │
└────────────────────────────┘
           │
           ▼ (repeat)
┌────────────────────────────┐
│        Rendering           │
│  (if needed, ~60fps)       │
└────────────────────────────┘
```

**Key Differences**:
| Aspect | Node.js | Browser |
|--------|---------|---------|
| Phases | 6 distinct phases | Tasks + Microtasks + Render |
| Timers | Dedicated phase | Uses tasks queue |
| I/O | Multiple phases | Single tasks queue |
| Rendering | N/A | Explicit step |

Node.js's phase-based model enables finer-grained control at the cost of complexity. Browsers prioritize rendering responsiveness.

## Architectural Summary

The Node.js event loop architecture embodies several key design decisions:

1. **Single-threaded concurrency**: One thread, many connections via event notification
2. **Phase-based state machine**: Predictable ordering through distinct phases
3. **Platform abstraction**: libuv hides OS differences (epoll/kqueue/IOCP)
4. **Task priority hierarchy**: nextTick > Microtasks > Phase callbacks
5. **Thread pool for blocking ops**: File I/O and CPU-bound work don't block the event
6. **Blocking wait when idle**: Efficient CPU usage when nothing to do

Understanding these architectural decisions clarifies why certain async patterns behave as they do—and why the distinction between `process.nextTick()`, `setImmediate()`, and Promises matters more than it might first appear.
