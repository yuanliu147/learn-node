---
title: "Event Loop Phases in Node.js"
description: "Deep dive into Node.js event loop phases, timers, callbacks, poll, check, and close phases"
tags:
  - nodejs
  - event-loop
  - timers
  - async
  - performance
related:
  - microtask-macrotask
  - commonjs-vs-esm
---

# Event Loop Phases in Node.js

Node.js is built around a non-blocking, event-driven architecture, and the **event loop** is the core mechanism that enables this. Understanding how the event loop processes callbacks across different phases is essential for writing performant asynchronous code.

## Overview of the Event Loop

When Node.js starts, it initializes the event loop, processes input scripts (which may make async API calls, schedule timers, etc.), then enters the event loop to process callbacks in a specific order.

The event loop in Node.js (libuv-based) consists of multiple **phases**, each with its own callback queue. The event loop cycles through these phases in a fixed order.

## The Phases in Order

```
┌─────────────────────────────┐
│          timers             │  ← setTimeout, setInterval callbacks
│   pending callbacks         │  ← I/O callbacks deferred from previous cycle
│   idle, prepare             │  ← internal use only
│          poll               │  ← retrieve new I/O events, execute I/O callbacks
│          check              │  ← setImmediate callbacks
│      close callbacks        │  ← socket.on('close') callbacks
└─────────────────────────────┘
```

### 1. Timers Phase

**Timers phase** executes callbacks scheduled by `setTimeout()` and `setInterval()`.

- A timer callback is specified **not** to execute at an exact time, but at least after the specified delay
- When the poll phase is empty and there are timers whose threshold has expired, the event loop will wrap back to the timers phase to execute those callbacks

```javascript
setTimeout(() => {
  console.log('setTimeout callback');
}, 100);

setInterval(() => {
  console.log('setInterval callback');
}, 200);
```

**Key behavior**: If you schedule a timer with 0ms, it doesn't execute immediately—it goes to the next event loop cycle after the poll phase becomes empty.

### 2. Pending Callbacks Phase

This phase executes **I/O callbacks** that were deferred from the previous poll phase cycle. For example:

- TCP socket errors (e.g., `ECONNREFUSED`) often get queued here
- Some internal libuv operations defer errors/retry callbacks to this phase

```javascript
const fs = require('fs');

fs.readFile('/path/to/file', (err, data) => {
  // This callback is executed in the poll phase
});

// If an error occurs and is deferred, it may run in pending callbacks phase
```

### 3. Idle, Prepare Phase

Used **internally** by libuv for bookkeeping and preparing the next cycle. Not accessible via userland APIs.

### 4. Poll Phase

The **poll phase** is the heart of I/O processing:

- **If the poll queue is not empty**: Node.js executes callbacks in the queue synchronously until the queue is exhausted or the system limit is reached
- **If the poll queue is empty**:
  - If there are scheduled `setImmediate()` callbacks, the event loop will proceed to the check phase
  - If there are no `setImmediate()` callbacks, it will wait for new I/O callbacks to be added to the poll queue

```javascript
const fs = require('fs');

// This I/O callback executes in the poll phase
fs.readFile('/etc/passwd', (err, data) => {
  if (err) throw err;
  console.log('File read complete');
});
```

### 5. Check Phase

The **check phase** executes callbacks for `setImmediate()`.

```javascript
setImmediate(() => {
  console.log('Immediate callback');
});
```

**Important relationship with poll phase**:
- `setImmediate()` callbacks are executed after the poll phase becomes idle
- If you call `setImmediate()` from within an I/O callback, it will be processed in the same event loop cycle, right after the I/O callback completes

```javascript
fs.readFile('/path', () => {
  console.log('I/O callback');
  setImmediate(() => {
    console.log('Immediate after I/O');
  });
});
// Output order: "I/O callback" → "Immediate after I/O"
```

### 6. Close Callbacks Phase

Executes callbacks for events emitted when a stream or handle is closed with `close` event handlers.

```javascript
const net = require('net');

const server = net.createServer();
server.close(() => {
  console.log('Server closed');
});

server.on('close', () => {
  console.log('Close event emitted');
});
```

## Event Loop Order in Practice

```javascript
setTimeout(() => console.log('1. setTimeout'), 0);
setImmediate(() => console.log('2. setImmediate'));
fs.readFile('/etc/passwd', () => {
  console.log('3. I/O callback');
  setTimeout(() => console.log('4. setTimeout in I/O'), 0);
  setImmediate(() => console.log('5. setImmediate in I/O'));
});

console.log('6. Synchronous code');
```

**Possible output**:
```
6. Synchronous code
1. setTimeout          ← timers phase
2. setImmediate        ← check phase (if poll completes quickly)
3. I/O callback        ← poll phase
5. setImmediate in I/O ← check phase (called after I/O)
4. setTimeout in I/O   ← timers phase
```

## process.nextTick() and promise microtasks

These are **not** part of the event loop phases—they are processed after the **current operation** completes, before the event loop continues. They have their own queues:

- `process.nextTick()` queue is processed after each phase's callbacks
- Promise `.then()` / async await microtasks are processed before `process.nextTick()` in some cases

See [[microtask-macrotask]] for full details.

## Key Takeaways

1. **Timers phase** runs `setTimeout`/`setInterval` callbacks
2. **Poll phase** processes all I/O callbacks
3. **Check phase** runs `setImmediate` callbacks immediately after poll
4. **`setImmediate` vs `setTimeout(0)`**: `setImmediate` fires in check phase, `setTimeout` fires in timers phase. I/O callbacks always have `setImmediate` fire before timers when called from inside an I/O cycle.
5. **Close callbacks** run when a handle is closed
6. **`process.nextTick()`** and **microtasks** run between phases, not as part of any phase

## Common Pitfalls

### Blocking the Event Loop

Long-running synchronous operations block all phases:

```javascript
// BAD: Blocks entire event loop
function compute() {
  while (true) {
    // intensive calculation
  }
}

// GOOD: Break up work using setImmediate
function computeChunk() {
  // do a piece of work
  if (workRemaining) {
    setImmediate(computeChunk);
  }
}
```

### Confusing setTimeout(0) and setImmediate

```javascript
// Inside an I/O cycle:
fs.readFile('file', () => {
  setTimeout(() => console.log('timeout'), 0);    // Runs after setImmediate
  setImmediate(() => console.log('immediate'));   // Runs first
});

// Outside I/O cycle (main module):
// Order is non-deterministic - depends on process performance
```

## References

- [libuv Documentation](http://docs.libuv.org/)
- [Node.js Event Loop Guide](https://nodejs.org/en/guides/event-loop-timers-and-nexttick)
- [The Node.js Event Loop, Timers, and process.nextTick()](https://nodejs.org/api/process.html#process_process_nexttick_callback_args)
