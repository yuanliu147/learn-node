# Async/Await

## Overview

Async/await is syntactic sugar over Promises that makes asynchronous code look and behave more like synchronous code. It was introduced in ES2017 and is now the preferred way to handle asynchronous operations in JavaScript.

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

### Pausing Execution

`await` pauses the async function, **not the entire program**:

```javascript
async function demo() {
  console.log('1');
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('3'); // Runs after 100ms
}

console.log('2');
demo();
console.log('4');

// Output: 2, 1, 4, 3
// The async function pauses at await, but main code continues
```

### Parallel vs Sequential Await

**Sequential** (slow - each waits for previous):

```javascript
async function sequential() {
  const a = await fetchA();  // Waits 1s
  const b = await fetchB();  // Waits 1s (after a completes)
  const c = await fetchC();  // Waits 1s (after b completes)
  // Total: ~3s
}
```

**Parallel** (fast - all start together):

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
    throw error; // Re-throw if you want the caller to handle it
  }
}
```

### Await with Promise.all for Partial Errors

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

## Async Arrow Functions

```javascript
// Arrow function
const getData = async (url) => {
  const response = await fetch(url);
  return response.json();
};

// Arrow function with concise body (implicit return)
const getData = async (url) => await fetch(url).then(r => r.json());
```

## Async Methods

### Object Methods

```javascript
const api = {
  async fetchUser(id) {
    const response = await fetch(`/api/users/${id}`);
    return response.json();
  },
  
  async createUser(data) {
    const response = await fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return response.json();
  }
};
```

### Class Methods

```javascript
class DataService {
  async fetchData(endpoint) {
    const response = await fetch(endpoint);
    return response.json();
  }
  
  async fetchAll(endpoints) {
    return Promise.all(
      endpoints.map(endpoint => this.fetchData(endpoint))
    );
  }
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

### Await in Loop Conditions

```javascript
async function findUserByName(name) {
  let page = 1;
  let user = null;
  
  while (!user && page <= 10) {
    const users = await fetchPage(page);
    user = users.find(u => u.name === name);
    page++;
  }
  
  return user;
}
```

## Async/Await Under the Hood

### How It Works

Async/await is compiled down to Promise chains by the JavaScript engine:

```javascript
// What you write:
async function example() {
  const a = await Promise.resolve(1);
  const b = await Promise.resolve(2);
  return a + b;
}

// What it roughly becomes:
function example() {
  return Promise.resolve(1)
    .then(a => Promise.resolve(2).then(b => a + b));
}
```

### State Machine

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
          fetchX().then(
            val => { x = val; resume(); },
            reject
          );
          break;
        case 1:
          state = 2;
          fetchY().then(
            val => { y = val; resolve(x + y); },
            reject
          );
          break;
      }
    }
    resume();
  });
}
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
  await db.connect(); // Assume this is async
  // Bug: missing await here!
  db.users.update(id, data); // This returns a Promise but you forgot to await
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
  const data = await fetchData(); // Error!
}

// Fix: make the function async
async function fixed() {
  const data = await fetchData();
  return data;
}
```

### Sequential When Parallel Intended

```javascript
// Slow: sequential (2s total)
async function slowWay(files) {
  return files.map(async file => {
    return await compress(file); // Each waits for previous!
  });
}

// Fast: parallel (~1s total for equal-sized files)
async function fastWay(files) {
  return Promise.all(
    files.map(file => compress(file)) // Don't need await here for Promise.all
  );
}
```

## Top-Level Await (ES2022)

In ES modules, you can use await at the top level:

```javascript
// module.mjs
const data = await fetch('/api/data').then(r => r.json());
console.log(data);
```

## Await vs Return

- `return value` - wraps value in Promise.resolve()
- `return await value` - waits for value, then returns it (allows try/catch to catch errors)

```javascript
async function withReturnAwait() {
  try {
    return await fetchData(); // Errors caught by try/catch
  } catch (e) {
    console.error(e);
  }
}

async function withReturn() {
  try {
    return fetchData(); // Errors NOT caught - returns rejected Promise
  } catch (e) {
    console.error(e); // Never runs!
  }
}
```

## Summary

- `async` functions always return Promises
- `await` pauses only the async function, not the entire program
- Use `Promise.all()` for parallel operations
- Always handle errors with try/catch
- Prefer async/await over raw Promise chains for readability
