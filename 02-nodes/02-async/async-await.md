# Async/Await

## Overview

Async/await is syntactic sugar over Promises that makes asynchronous code look and behave more like synchronous code. Introduced in ES2017, it provides an architectural choice for managing asynchronous operations in JavaScript.

**Architecture Perspective**: Async/await represents a declarative approach to async control flow, trading some granular control for improved readability and maintainability. Understanding when to use it (and when not to) is a key architectural decision.

## What Problem It Solves

### The Promise Chain Problem

Raw Promise chains become unwieldy:

```javascript
// Hard to read: 3 levels of nesting
fetch('/api/user')
  .then(user => fetch(`/api/posts/${user.id}`))
  .then(posts => fetch(`/api/comments/${posts[0].id}`))
  .then(comments => console.log(comments))
  .catch(err => console.error(err));
```

### The Callback Pyramid

Async/await flattens this into linear code:

```javascript
// Easy to read: sequential, linear flow
async function getComments() {
  try {
    const user = await fetch('/api/user');
    const posts = await fetch(`/api/posts/${user.id}`);
    const comments = await fetch(`/api/comments/${posts[0].id}`);
    console.log(comments);
  } catch (err) {
    console.error(err);
  }
}
```

## Architecture

### Execution Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Call Site                                 │
│  async function demo() {                                     │
│    console.log('1');                                        │
│    await promise;  ◄─── Pauses only this function           │
│    console.log('3');                                        │
│  }                                                           │
│                                                               │
│  console.log('2');  ←── Main thread continues               │
│  demo();                                                     │
│  console.log('4');  ←── Runs before '3'                      │
└─────────────────────────────────────────────────────────────┘
```

### Relationship to Promises

Async/await compiles down to Promise chains:

```javascript
// What you write:
async function example() {
  const a = await Promise.resolve(1);
  const b = await Promise.resolve(2);
  return a + b;
}

// What it becomes (simplified):
function example() {
  return Promise.resolve(1)
    .then(a => Promise.resolve(2).then(b => a + b));
}
```

### State Machine Transformation

The compiler transforms async functions into a state machine:

```javascript
// Your code:
async function foo() {
  const x = await fetchX();
  const y = await fetchY();
  return x + y;
}

// Generated state machine (simplified):
let state = 0; // 0=start, 1=waiting-x, 2=waiting-y, 3=done

function foo() {
  return new Promise((resolve, reject) => {
    function resume() {
      switch (state) {
        case 0:
          state = 1;
          fetchX().then(val => { x = val; resume(); }, reject);
          break;
        case 1:
          state = 2;
          fetchY().then(val => { y = val; resolve(x + y); }, reject);
          break;
      }
    }
    resume();
  });
}
```

## Advantages

| Advantage | Description |
|-----------|-------------|
| **Readability** | Code reads like synchronous steps, reducing cognitive load |
| **Error Handling** | Try/catch works like synchronous code—no `.catch()` chains |
| **Debugging** | Step-through debugging works naturally; breakpoints hit line-by-line |
| **Stack Traces** | Better stack traces than raw Promise chains |
| **Control Flow** | Natural expression of sequential dependencies |

## Disadvantages

| Disadvantage | Description |
|--------------|-------------|
| **Overhead** | Slight performance cost vs raw Promise chains (state machine creation) |
| **Loss of Granular Control** | Can't easily cancel, pause, or inspect in-progress async ops |
| **Parallelism Blur** | Easy to accidentally write sequential code when parallel intended |
| **Blocking Semantics** | `await` can suggest "blocking" to those unfamiliar (it doesn't) |
| **Error Stack Complexity** | Errors can have confusing stacks when await chains cross microtasks |

## Applicable Scenarios

### ✅ Good Fit: Sequential Dependencies

When each step depends on the previous:

```javascript
async function getUserDashboard(userId) {
  const user = await fetchUser(userId);      // Need user first
  const permissions = await fetchPerms(user.role);  // Depends on user
  const dashboard = await buildDashboard(user, permissions); // Depends on both
  return dashboard;
}
```

### ✅ Good Fit: Error Propagation

When you want centralized error handling:

```javascript
async function processOrder(orderId) {
  try {
    const order = await validateOrder(orderId);
    const payment = await chargePayment(order);
    const shipment = await createShipment(order);
    return { order, payment, shipment };
  } catch (error) {
    // All errors land here—no need for .catch() chains
    await logError(error);
    throw error;
  }
}
```

### ❌ Poor Fit: Fire-and-Forget

When you don't care about the result:

```javascript
// Wasteful: creates unnecessary async machinery
async function notifyUsers() {
  await sendEmail();  // Waiting for email is unnecessary
}

// Better: fire and forget
function notifyUsers() {
  sendEmail();  // Returns Promise but we don't await
  return;       // Immediate return
}
```

### ❌ Poor Fit: Highly Dynamic Concurrency

When you need fine-grained control over many parallel operations:

```javascript
// Await makes this awkward
async function processWithDynamicLimits() {
  const results = [];
  for (const batch of chunks) {
    const active = [];
    for (const item of batch) {
      if (active.length >= limit) {
        await Promise.race(active);
      }
      active.push(process(item));
    }
    results.push(await Promise.all(active));
  }
}

// Consider: dedicated concurrency libraries or generators instead
```

## Selection Decision

### Choose Async/Await When:

1. **Linear dependency chains**: A → B → C where each needs the previous
2. **Centralized error handling**: Try/catch covers all operations
3. **Readability priority**: Team familiar with the pattern
4. **Standard CRUD operations**: Database calls, API requests, file I/O
5. **Middleware/filter patterns**: Sequential processing of requests

### Choose Raw Promises When:

1. **Parallel-only operations**: No dependencies between tasks
2. **Fine-grained control**: Need to inspect, cancel, or compose futures
3. **Performance-critical paths**: Every microsecond matters (rare)
4. **Library code**: Don't want to impose async/await on consumers
5. **Streaming/chunked processing**: Generator-based patterns

### Hybrid Approach

Mix based on context:

```javascript
class DataService {
  // Use async/await for readable method bodies
  async fetchUserData(userId) {
    const [user, posts, preferences] = await Promise.all([
      this.fetchUser(userId),
      this.fetchPosts(userId),
      this.fetchPreferences(userId)
    ]);
    
    // Use raw Promise for conditional logic
    return this.calculateScore(user, posts, preferences)
      .then(score => ({ user, posts, preferences, score }));
  }
}
```

## Common Misunderstandings

### Misunderstanding 1: "Await Blocks the Thread"

**Wrong**: `await` pauses JavaScript execution like a sleep.

**Right**: `await` pauses only the async function. The main thread continues.

```javascript
async function demo() {
  console.log('1');
  await new Promise(r => setTimeout(r, 100));
  console.log('3'); // Runs after 100ms, but main code continues
}

console.log('2');
demo();
console.log('4');

// Output: 2, 1, 4, 3  (NOT 2, 1, 3, 4)
```

### Misunderstanding 2: Sequential vs Parallel

**Wrong**: `await` inside array methods runs in parallel.

**Right**: `await` in a `.map()` callback still runs sequentially unless combined with `Promise.all()`.

```javascript
// SLOW: Sequential (3s total)
async function slowWay(files) {
  return files.map(async file => {
    return await compress(file); // Each waits for previous!
  });
}

// FAST: Parallel (~1s total)
async function fastWay(files) {
  return Promise.all(
    files.map(file => compress(file)) // No await needed
  );
}
```

### Misunderstanding 3: Return vs Return await

```javascript
// Different behavior!

async function withReturnAwait() {
  try {
    return await fetchData(); // try/catch catches errors
  } catch (e) {
    console.error(e);
  }
}

async function withReturn() {
  try {
    return fetchData(); // try/catch DOES NOT catch—returns rejected Promise
  } catch (e) {
    console.error(e); // Never runs!
  }
}
```

### Misunderstanding 4: Async Arrow Functions

```javascript
// Concise body: implicit return (no await wrapping)
const getData = async (url) => fetch(url).then(r => r.json());

// Block body: explicit return needed
const getData = async (url) => {
  const response = await fetch(url);  // This await works
  return response.json();
};
```

## Basic Syntax

### Async Functions

An `async` function always returns a Promise:

```javascript
async function fetchData(url) {
  return 'data';
}

// Equivalent to:
function fetchData(url) {
  return Promise.resolve('data');
}
```

### Await Operator

The `await` keyword:
- Can only be used inside an `async` function
- Pauses execution of the async function until the Promise settles
- Returns the resolved value if the Promise fulfills
- Throws the error if the Promise rejects

```javascript
async function example() {
  const value = await Promise.resolve(42);
  console.log(value); // 42
}
```

## Await Behavior

### Parallel vs Sequential

**Sequential** (slow—each waits for previous):

```javascript
async function sequential() {
  const a = await fetchA();  // Waits 1s
  const b = await fetchB();  // Waits 1s (after a completes)
  const c = await fetchC();  // Waits 1s (after b completes)
  // Total: ~3s
}
```

**Parallel** (fast—all start together):

```javascript
async function parallel() {
  const [a, b, c] = await Promise.all([
    fetchA(),  // All start immediately
    fetchB(),
    fetchC()
  ]);
  // Total: ~1s (all run concurrently)
}
```

## Error Handling

### Try/Catch

```javascript
async function withTryCatch() {
  try {
    const data = await fetchData('https://api.example.com');
    console.log('Success:', data);
  } catch (error) {
    console.error('Failed:', error.message);
  }
}
```

### Multiple Await with Single Try/Catch

```javascript
async function getUserData(userId) {
  try {
    const user = await fetchUser(userId);
    const posts = await fetchPosts(userId);
    const comments = await fetchComments(userId);
    return { user, posts, comments };
  } catch (error) {
    console.error('Failed to load user data:', error.message);
    throw error;
  }
}
```

### Partial Failures with Promise.allSettled

Use `Promise.allSettled` when you want to handle partial failures:

```javascript
async function loadAllData() {
  const results = await Promise.allSettled([
    fetchUsers(),
    fetchPosts(),
    fetchComments()
  ]);
  
  const users = results[0].status === 'fulfilled' ? results[0].value : [];
  const posts = results[1].status === 'fulfilled' ? results[1].value : [];
  const comments = results[2].status === 'fulfilled' ? results[2].value : [];
  
  return { users, posts, comments };
}
```

## Common Patterns

### Sequential Processing

```javascript
async function processItems(items) {
  const results = [];
  
  for (const item of items) {
    const result = await processItem(item);
    results.push(result);
  }
  
  return results;
}
```

### Parallel with Limited Concurrency

```javascript
async function processWithLimit(items, limit = 3) {
  const results = [];
  
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(
      batch.map(item => processItem(item))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

### Retry with Exponential Backoff

```javascript
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, attempt)));
    }
  }
}
```

## Top-Level Await (ES2022)

In ES modules, you can use await at the top level:

```javascript
// module.mjs
const data = await fetch('/api/data').then(r => r.json());
console.log(data);
```

## Async Iterator (for await...of)

Process async generators and async iterables:

```javascript
async function* asyncGenerator() {
  yield Promise.resolve(1);
  yield Promise.resolve(2);
  yield Promise.resolve(3);
}

async function processAsyncIterator() {
  for await (const value of asyncGenerator()) {
    console.log(value); // 1, 2, 3
  }
}
```

## Common Pitfalls

### Forgetting to Await

```javascript
// Bug: doesn't wait for save to complete
async function updateUser(id, data) {
  await db.connect();
  db.users.update(id, data); // Missing await—returns Promise silently ignored
  return { success: true };
}

// Fix:
async function updateUser(id, data) {
  await db.connect();
  await db.users.update(id, data);
  return { success: true };
}
```

### Await in Non-Async Function

```javascript
// SyntaxError: await is only valid in async functions
function broken() {
  const data = await fetchData();
}

// Fix: make the function async
async function fixed() {
  const data = await fetchData();
  return data;
}
```

## Questions to Test Understanding

1. When does `await` block the main thread vs. only the async function?
2. Why might `Promise.all([...items.map(async x => await foo(x))])` be slower than expected?
3. What's the difference between `return await` and `return` in an async function?
4. When would you choose raw Promises over async/await?
5. How does async/await relate to the event loop phases?

## Summary

- **Problem solved**: Verbose Promise chains and callback pyramids
- **Trade-offs**: Readability over granular control
- **Best for**: Sequential dependencies, centralized error handling
- **Avoid for**: Fire-and-forget, highly dynamic concurrency
- **Key insight**: `await` pauses only the async function, not the entire program
- **Performance**: Slight overhead vs raw Promises; use `Promise.all()` for parallelism
