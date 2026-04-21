# Callbacks in Node.js

## Overview

A callback is a function passed as an argument to another function, which is then invoked at a later time to complete an asynchronous operation. Callbacks were the original pattern for handling async operations in Node.js.

## Callback Pattern

### Basic Syntax

```javascript
function asyncOperation(params, callback) {
  // Perform async work
  setTimeout(() => {
    if (/* success */) {
      callback(null, result);  // Node convention: error first
    } else {
      callback(new Error('Failed'), null);
    }
  }, 100);
}

// Usage
asyncOperation('data', (err, result) => {
  if (err) {
    console.error('Error:', err.message);
    return;
  }
  console.log('Result:', result);
});
```

## Error-First Callbacks

Node.js convention: callbacks always receive error as first argument:

```javascript
// Signature: callback(error, result)
fs.readFile('file.txt', (err, data) => {
  if (err) {
    // Handle error
    console.error('Read failed:', err.message);
    return;
  }
  // Handle success
  console.log('File contents:', data.toString());
});
```

### Why Error-First?

1. **Consistency** - All Node.js callbacks follow same pattern
2. **Error handling** - Errors can't be accidentally ignored
3. **Optional results** - Can check if error exists before accessing result
4. **Stack trace** - Errors can carry stack traces from async boundaries

## Callback Hell (Pyramid of Doom)

Nested callbacks create "callback hell":

```javascript
fs.readFile('config.json', (err, config) => {
  if (err) throw err;
  
  db.connect(config.db, (err, connection) => {
    if (err) throw err;
    
    connection.query('SELECT * FROM users', (err, users) => {
      if (err) throw err;
      
      connection.query('SELECT * FROM orders', (err, orders) => {
        if (err) throw err;
        
        connection.close();
        console.log('Users:', users, 'Orders:', orders);
      });
    });
  });
});
```

### Problems with Callback Hell

1. **Readability** - Hard to follow execution flow
2. **Error handling** - Must handle errors at every level
3. **Maintenance** - Code is hard to modify
4. **Debugging** - Stack traces are less useful

## Solutions to Callback Hell

### 1. Named Functions

```javascript
function handleConfig(err, config) {
  if (err) throw err;
  db.connect(config.db, handleConnection);
}

function handleConnection(err, connection) {
  if (err) throw err;
  connection.query('SELECT * FROM users', handleUsers);
}

function handleUsers(err, users) {
  if (err) throw err;
  // ...
}

fs.readFile('config.json', handleConfig);
```

### 2. Async Libraries

Using `async` module:

```javascript
const async = require('async');

async.waterfall([
  (callback) => {
    fs.readFile('config.json', (err, config) => callback(err, JSON.parse(config)));
  },
  (config, callback) => {
    db.connect(config.db, (err, connection) => callback(err, connection));
  },
  (connection, callback) => {
    connection.query('SELECT * FROM users', (err, users) => callback(err, users));
  }
], (err, users) => {
  if (err) console.error(err);
  console.log('Users:', users);
});
```

### 3. Promises (Recommended)

```javascript
const fs = require('fs').promises;

async function main() {
  const config = JSON.parse(await fs.readFile('config.json'));
  const connection = await db.connectPromise(config.db);
  const users = await connection.queryPromise('SELECT * FROM users');
  return users;
}
```

### 4. Async/Await (Most Readable)

```javascript
const fs = require('fs').promises;

async function main() {
  const config = JSON.parse(await fs.readFile('config.json'));
  const connection = await db.connectPromise(config.db);
  const users = await connection.queryPromise('SELECT * FROM users');
  return users;
}
```

## Synchronous vs Asynchronous Callbacks

### Synchronous Callbacks

```javascript
const numbers = [1, 2, 3, 4, 5];

numbers.forEach((num) => {
  console.log(num);  // Runs immediately, synchronously
});
```

### Asynchronous Callbacks

```javascript
const fs = require('fs');

console.log('1: before readFile');

fs.readFile('file.txt', (err, data) => {
  console.log('3: inside callback');
});

console.log('2: after readFile');

// Output:
// 1: before readFile
// 2: after readFile
// 3: inside callback
```

## Common Node.js Callback Patterns

### Single Operation Callback

```javascript
function delay(ms, callback) {
  setTimeout(() => {
    callback(null, 'done');
  }, ms);
}
```

### Nodeback Style (Node.js Style Callback)

```javascript
// Standard signature
function nodeStyleFunction(arg1, arg2, callback) {
  // callback(error, result)
}

nodeStyleFunction('a', 'b', (err, result) => {
  if (err) return handleError(err);
  useResult(result);
});
```

### Converting Callbacks to Promises

```javascript
// Manual conversion
function promisedFunction(arg) {
  return new Promise((resolve, reject) => {
    originalFunction(arg, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Using util.promisify (Node.js built-in)
const { promisify } = require('util');
const readFilePromise = promisify(fs.readFile);

// Using .promises on fs
const readFile = fs.promises.readFile;
```

##this Context in Callbacks

### Problem with this

```javascript
const myObject = {
  name: 'myObject',
  
  fetchData(callback) {
    someAsyncOperation((err, data) => {
      // Bug: this is not myObject here
      console.log(this.name); // undefined or error
    });
  }
};
```

### Solutions

**Solution 1: Bind**

```javascript
fetchData(callback) {
  someAsyncOperation((err, data) => {
    console.log(this.name);
  }.bind(this));
}
```

**Solution 2: Arrow Function**

```javascript
fetchData(callback) {
  someAsyncOperation((err, data) => {
    console.log(this.name); // Works - arrow preserves this
  });
}
```

**Solution 3: Pass as Second Arg**

```javascript
fetchData(callback) {
  const self = this;
  someAsyncOperation(function(err, data) {
    console.log(self.name); // self preserves this
  });
}
```

## Error Handling in Callbacks

### Handling Errors at Each Level

```javascript
function readFiles(files, callback) {
  if (!files.length) return callback(null, []);
  
  const results = [];
  let completed = 0;
  let hasError = false;
  
  files.forEach((file, index) => {
    fs.readFile(file, (err, data) => {
      if (hasError) return;
      
      if (err) {
        hasError = true;
        callback(err);
        return;
      }
      
      results[index] = data;
      completed++;
      
      if (completed === files.length) {
        callback(null, results);
      }
    });
  });
}
```

### Error Propagation

Errors don't automatically propagate through callbacks - they must be explicitly passed:

```javascript
// Error IS propagated
function badRead(file, callback) {
  fs.readFile(file, (err, data) => {
    if (err) callback(err); // Error passed to callback
    callback(null, data);
  });
}

// Error is NOT propagated (common bug!)
function reallyBadRead(file, callback) {
  fs.readFile(file, (err, data) => {
    if (err) throw err; // Thrown into void - callback never called
    callback(null, data);
  });
}
```

## Callback vs Promise vs Async/Await

| Aspect | Callbacks | Promises | Async/Await |
|--------|-----------|----------|-------------|
| Readability | Nested/hard to follow | Chainable | Sequential/linear |
| Error handling | Manual/check err param | .catch() | try/catch |
| Composition | Manual | .all(), .race() | Promise.all |
| Flow control | Inversion of control | Retained control | Looks synchronous |
| Stack traces | Poor | Better | Best |
| Debugging | Difficult | Easier | Easiest |

## When to Use Callbacks Today

Callbacks are still used:

1. **Legacy Node.js APIs** - Many core modules still have callback APIs
2. **Event Emitters** - `emitter.on('event', callback)`
3. **Streams** - `stream.on('data', callback)`
4. **Third-party libraries** - Some libraries haven't updated

Modern code should prefer Promises or async/await.

## Summary

- Node.js uses error-first callbacks: `callback(error, result)`
- Callbacks can be synchronous or asynchronous
- Nested callbacks lead to "callback hell" - use named functions, async library, or Promises
- Arrow functions solve the `this` binding problem in callbacks
- Always handle errors explicitly in callbacks
- Modern Node.js code should prefer Promises/async-await
