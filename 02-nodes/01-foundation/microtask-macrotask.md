---
title: "Microtasks vs Macrotasks in Node.js"
description: "Understanding the task queues: Promise callbacks, queueMicrotask, process.nextTick, setTimeout, setImmediate"
tags:
  - nodejs
  - promises
  - async
  - microtasks
  - macrotasks
  - event-loop
related:
  - event-loop-phases
  - commonjs-vs-esm
---

# Microtasks vs Macrotasks in Node.js

Understanding the distinction between microtasks and macrotasks is fundamental to predicting asynchronous code execution order in Node.js. This knowledge helps debug subtle ordering bugs and write predictable async code.

## What Are Tasks?

JavaScript execution is single-threaded. The **event loop** schedules work via **tasks** (macrotasks) and **microtasks**. The key difference lies in **when** they are executed relative to each other and the main script.

## Microtasks

**Microtasks** are short-running tasks associated with the current execution context. They have **higher priority** than macrotasks.

### Sources of Microtasks

1. **Promise callbacks** (`then`, `catch`, `finally`)
2. **`queueMicrotask()`** API
3. **`process.nextTick()`** (Node.js specific—technically higher priority than promise microtasks)

### Microtask Queue Processing Rules

After the current synchronous code segment completes and before returning control to the event loop:

1. All microtasks in the queue are executed
2. This includes microtasks added *during* microtask processing
3. The microtask queue is drained completely before the next macrotask runs

```javascript
Promise.resolve()
  .then(() => console.log('promise 1'))
  .then(() => console.log('promise 2'))
  .then(() => console.log('promise 3'));

// Output:
// promise 1
// promise 2
// promise 3
```

Each `.then()` returns a new promise, and the subsequent `.then()` is queued only after the previous one resolves.

## Macrotasks

**Macrotasks** (also called "tasks" or "macro-tasks") are the standard event loop work items. Each event loop phase processes its own macrotask queue.

### Sources of Macrotasks

1. **`setTimeout()`**
2. **`setInterval()`**
3. **`setImmediate()`**
4. **I/O callbacks** (from poll phase)
5. **`requestAnimationFrame`** (browser, not Node.js)

## Execution Order

The canonical order within each event loop tick:

```
┌─────────────────────────────────────────────────────────────┐
│                        call stack                            │
│                    (synchronous code)                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    microtask queue                           │
│  • process.nextTick() callbacks                              │
│  • Promise .then() / catch() / finally() callbacks          │
│  • queueMicrotask() callbacks                                │
│                                                             │
│  ⚠️ Drained COMPLETELY before any macrotask runs            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      macrotask queue                         │
│  • setTimeout / setInterval callbacks                        │
│  • setImmediate callbacks                                    │
│  • I/O callbacks                                            │
│  • (One macrotask per cycle, unless poll phase is active)    │
└─────────────────────────────────────────────────────────────┘
```

## Detailed Examples

### Example 1: Basic Microtask vs Macrotask

```javascript
console.log('1. synchronous');

setTimeout(() => console.log('2. setTimeout'), 0);

Promise.resolve()
  .then(() => console.log('3. promise .then'));

queueMicrotask(() => console.log('4. queueMicrotask'));

process.nextTick(() => console.log('5. process.nextTick'));

console.log('6. synchronous end');
```

**Output**:
```
1. synchronous
6. synchronous end
5. process.nextTick    ← nextTick runs before other microtasks
4. queueMicrotask      ← queueMicrotask is a microtask
3. promise .then        ← promise .then is a microtask
2. setTimeout          ← setTimeout is a macrotask
```

**Why?** After the main script finishes, the microtask queue is drained first—`process.nextTick` (highest priority in Node.js), then `queueMicrotask`, then Promise callbacks. Only then does the event loop proceed to the timers phase for `setTimeout`.

### Example 2: Microtasks Inside Macrotasks

```javascript
setTimeout(() => {
  console.log('1. setTimeout start');
  Promise.resolve()
    .then(() => console.log('2. promise inside setTimeout'));
  process.nextTick(() => console.log('3. nextTick inside setTimeout'));
  console.log('4. setTimeout end');
}, 0);

setTimeout(() => {
  console.log('5. second setTimeout');
}, 0);
```

**Output**:
```
1. setTimeout start
4. setTimeout end
3. nextTick inside setTimeout    ← nextTick from within macrotask
2. promise inside setTimeout     ← promise from within macrotask
5. second setTimeout             ← next macrotask runs after microtasks
```

**Why?** When the first `setTimeout` callback executes, the synchronous `console.log` runs first. After that macrotask callback completes, the microtask queue is drained before the next macrotask runs—so `process.nextTick` and promise callbacks from inside the first timeout execute before the second timeout.

### Example 3: process.nextTick vs Promise Microtasks

```javascript
process.nextTick(() => {
  console.log('1. nextTick');
  process.nextTick(() => console.log('2. nextTick nested'));
});

Promise.resolve()
  .then(() => console.log('3. promise'));

process.nextTick(() => {
  console.log('4. nextTick after promise.then');
});
```

**Output**:
```
1. nextTick
2. nextTick nested
4. nextTick after promise.then
3. promise
```

**Important**: In Node.js, `process.nextTick()` callbacks run **before** Promise microtasks. This is Node.js-specific behavior—browsers run promise callbacks before `queueMicrotask()`, but `process.nextTick()` is Node.js-specific and takes precedence.

### Example 4: async/await and Microtasks

```javascript
async function example() {
  console.log('1. async function start');
  await Promise.resolve();
  console.log('2. after await');
  await Promise.resolve();
  console.log('3. after second await');
}

example();

Promise.resolve()
  .then(() => console.log('4. promise.then'));
```

**Output**:
```
1. async function start
4. promise.then           ← Promise microtask runs before await continuation
2. after await
3. after second await
```

**Why?** `await` suspends the function and schedules the continuation as a microtask. The first `await` schedules continuation after the promise resolves, but a `Promise.resolve()` resolves immediately, so its `.then()` (microtask) runs before the async function's continuation.

## Node.js-Specific: process.nextTick() Queue vs Microtask Queue

Node.js actually maintains **two** separate microtask-like queues:

1. **`process.nextTick()` queue** — processed after each phase, before the microtask queue
2. **Native promise microtask queue** — processed after nextTick queue

Order in Node.js per event loop tick:
```
nextTick queue (process.nextTick)
→ microtask queue (Promises, queueMicrotask)
→ next macrotask
```

```javascript
process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise'));
queueMicrotask(() => console.log('queueMicrotask'));
```

**Output in Node.js**:
```
nextTick
queueMicrotask
promise
```

In browsers (with `queueMicrotask` and promise), order is typically `queueMicrotask` then promise, but `process.nextTick` is Node.js-only.

## queueMicrotask() API

`queueMicrotask()` is a standard API available in both browsers and Node.js for explicitly queuing a microtask:

```javascript
queueMicrotask(() => {
  console.log('This runs as a microtask');
});
```

Use cases:
- Defer work safely without using async I/O
- Ensure something runs before the next render (browsers)
- Keep a function's side effects isolated to the microtask checkpoint

## Common Pitfalls

### Forgetting Microtasks Block the Queue

```javascript
// This creates an infinite microtask loop
let i = 0;
function tick() {
  Promise.resolve().then(() => {
    i++;
    if (i < 1000000) tick(); // Keeps adding microtasks!
  });
}
```

### Relying on Specific Ordering Between nextTick and Promises

```javascript
// Unreliable pattern - nextTick ordering is implementation detail
process.nextTick(async () => {
  // nextTick behavior with async can be surprising
});
```

### Blocking with Microtasks

```javascript
// BAD: Synchronous infinite loop blocks microtasks from ever running
while (true) {
  // blocks everything
}
```

## When to Use What

| API | Type | Use Case |
|-----|------|----------|
| `process.nextTick()` | Node.js microtask | Breaking up long sync operations, ensuring execution order |
| `queueMicrotask()` | Standard microtask | Portable microtask queuing |
| `Promise.then/catch/finally` | Microtask | Chaining async operations |
| `setTimeout(fn, 0)` | Macrotask | Defer work to next event loop cycle |
| `setImmediate()` | Macrotask | Execute after I/O events |

## Key Takeaways

1. **Microtasks execute before macrotasks** in the same event loop tick
2. **`process.nextTick()`** has higher priority than Promise microtasks in Node.js
3. **`queueMicrotask()`** is the standardized way to queue microtasks
4. **Microtask queue is drained completely** before the next macrotask runs (including microtasks added during microtask processing)
5. Understanding microtask/macrotask ordering is critical for debugging async race conditions

## References

- [MDN: queueMicrotask()](https://developer.mozilla.org/en-US/docs/Web/API/queueMicrotask)
- [Node.js process.nextTick()](https://nodejs.org/api/process.html#process_process_nexttick_callback_args)
- [WHATWG HTML Specification: JavaScript execution contexts](https://html.spec.whatwg.org/multipage/webappapis.html#task-queue)
