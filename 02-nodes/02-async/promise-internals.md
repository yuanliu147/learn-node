# Promise Internals

## Overview

A Promise is an object representing the eventual completion or failure of an asynchronous operation. It serves as a placeholder for a value that is not yet available but will be at some point in the future.

## Promise States

A Promise is always in one of three states:

| State | Description |
|-------|-------------|
| **Pending** | Initial state - neither fulfilled nor rejected |
| **Fulfilled** | Operation completed successfully, `resolve()` was called |
| **Rejected** | Operation failed, `reject()` was called |

**Important**: A Promise can only transition from `pending` to `fulfilled` OR from `pending` to `rejected` - never back to `pending` and never from `fulfilled` to `rejected` or vice versa. This is called **settling**.

## Promise Lifecycle Diagram

```
                    ┌─────────────┐
                    │   Pending   │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
       ┌───────────┐             ┌───────────┐
       │ Fulfilled │             │ Rejected  │
       └───────────┘             └───────────┘
```

## Creating a Promise

### Constructor Syntax

```javascript
const promise = new Promise((resolve, reject) => {
  // Async operation here
  
  if (/* operation successful */) {
    resolve(value);  // Transition to fulfilled
  } else {
    reject(error);   // Transition to rejected
  }
});
```

### Full Example

```javascript
function fetchData(url) {
  return new Promise((resolve, reject) => {
    console.log(`Fetching data from ${url}...`);
    
    // Simulate async operation
    setTimeout(() => {
      if (url.startsWith('http')) {
        resolve({ status: 200, data: 'Response data' });
      } else {
        reject(new Error('Invalid URL'));
      }
    }, 1000);
  });
}

fetchData('https://api.example.com')
  .then(data => console.log('Success:', data))
  .catch(err => console.error('Error:', err.message));
```

## Promise Implementation Internals

### Internal Properties

A Promise has several internal properties (not accessible directly):

```javascript
{
  [[PromiseState]]: 'pending' | 'fulfilled' | 'rejected',
  [[PromiseResult]]: undefined | value | error,
  [[PromiseFulfillReactions]]: [],  // Chain of .then() handlers
  [[PromiseRejectReactions]]: []    // Chain of .catch() handlers
}
```

### The Promise Resolution Process

When `resolve()` is called:

1. If the value is another Promise, the current Promise adopts its state
2. If the value is a thenable (object with `.then()` method), the Promise tries to call it
3. Otherwise, the Promise immediately fulfills with that value

```javascript
const p1 = new Promise((resolve) => {
  resolve(Promise.resolve('nested')); // p1 adopts inner Promise's state
});

p1.then(val => console.log(val)); // 'nested'
```

### Chaining and the Promise Resolution Algorithm

When you chain `.then()`, each `.then()` returns a **new Promise**:

```javascript
Promise.resolve(5)
  .then(x => x * 2)      // Returns Promise resolved to 10
  .then(x => x + 1)      // Returns Promise resolved to 11
  .then(console.log);    // Prints 11
```

**Key insight**: Each `.then()` creates a new Promise. The original Promise is never modified.

### How Chaining Works

```
Promise.resolve(5)
  .then(x => x * 2)   ──► Creates Promise2 (pending until x * 2 completes)
       │
       └── Thenable: { then: onFulfilled: (resolve) => resolve(10) }
       
  .then(x => x + 1)   ──► Creates Promise3 (pending until x + 1 completes)
       │
       └── Thenable: { then: onFulfilled: (resolve) => resolve(11) }
       
  .then(console.log)  ──► Creates Promise4 (pending until console.log completes)
```

### Return Values in Chain

- If a handler **returns a value**, the next Promise resolves to that value
- If a handler **returns a Promise**, the next Promise adopts that Promise's state
- If a handler **throws an error**, the next Promise is rejected

```javascript
Promise.resolve(1)
  .then(x => {
    // Returns primitive → next Promise resolves to 2
    return x + 1;
  })
  .then(x => {
    // Returns Promise → next Promise adopts its state
    return new Promise(resolve => setTimeout(() => resolve(x * 10), 100));
  })
  .then(x => {
    // Throws → next Promise rejects with Error
    throw new Error('Something went wrong');
  })
  .catch(err => {
    // This catches the error above
    console.error(err.message);
  });
```

## Microtask Queue

Promise callbacks (`.then()`, `.catch()`, `.finally()`) are executed as **microtasks**, which have higher priority than regular async tasks (macrotasks like `setTimeout`).

```javascript
console.log('1: Start');

setTimeout(() => console.log('4: setTimeout'), 0);

Promise.resolve()
  .then(() => console.log('2: Promise microtask'));

console.log('3: End');

// Output:
// 1: Start
// 3: End
// 2: Promise microtask
// 4: setTimeout
```

### Execution Order

1. All synchronous code runs first
2. All microtasks (Promises, queueMicrotask) run until empty
3. One macrotask (setTimeout, setImmediate, I/O) runs
4. Repeat

## Error Handling Internals

### How `.catch()` Works

`.catch(onRejected)` is equivalent to `.then(null, onRejected)`:

```javascript
// These are equivalent:
promise.catch(err => handleError(err));
promise.then(null, err => handleError(err));
```

### Error Propagation

Errors propagate through the chain until caught:

```javascript
Promise.reject(new Error('Initial error'))
  .then(x => x + 1)      // Skipped - passes Error to next handler
  .then(x => x * 2)      // Skipped
  .catch(err => {
    console.error(err.message); // Catches and handles
    return 'recovered';         // Returns value to next .then()
  })
  .then(x => console.log(x)); // 'recovered'
```

### Unhandled Rejections

If a Promise rejects and there's no `.catch()`, a **unhandledrejection** event is emitted:

```javascript
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

Promise.reject(new Error('Oops!'));
// Event emitted after one tick
```

## Static Promise Methods

### Promise.resolve()

Creates a resolved Promise:

```javascript
Promise.resolve(value);
// Equivalent to:
new Promise(resolve => resolve(value));
```

If passed a Promise, returns that Promise (not a new one):

```javascript
const p = Promise.resolve(5);
const p2 = Promise.resolve(p);
console.log(p === p2); // true
```

### Promise.reject()

Creates a rejected Promise:

```javascript
Promise.reject(error);
// Equivalent to:
new Promise((_, reject) => reject(error));
```

### Promise.all()

Waits for all Promises to fulfill or any to reject:

```javascript
const promises = [
  Promise.resolve(1),
  Promise.resolve(2),
  Promise.resolve(3)
];

const results = await Promise.all(promises);
console.log(results); // [1, 2, 3]
```

**Behavior**:
- If **all** resolve → resolves with array of results
- If **any** reject → rejects immediately with that error
- Maintains order regardless of completion order

### Promise.allSettled()

Waits for all Promises to settle (fulfill or reject):

```javascript
const promises = [
  Promise.resolve(1),
  Promise.reject(new Error('Failed')),
  Promise.resolve(3)
];

const results = await Promise.allSettled(promises);
// [
//   { status: 'fulfilled', value: 1 },
//   { status: 'rejected', reason: Error('Failed') },
//   { status: 'fulfilled', value: 3 }
// ]
```

### Promise.race()

Resolves or rejects as soon as **one** Promise settles:

```javascript
const promises = [
  new Promise(resolve => setTimeout(() => resolve('fast'), 100)),
  new Promise(resolve => setTimeout(() => resolve('slow'), 500))
];

const result = await Promise.race(promises);
console.log(result); // 'fast' (after ~100ms)
```

### Promise.any()

Resolves when **any** Promise fulfills (ignores rejections until all reject):

```javascript
const promises = [
  Promise.reject(new Error('Error 1')),
  Promise.resolve(2),
  Promise.reject(new Error('Error 3'))
];

const result = await Promise.any(promises);
console.log(result); // 2
```

**Error case**: If all reject, returns `AggregateError`:

```javascript
Promise.any([
  Promise.reject(new Error('a')),
  Promise.reject(new Error('b'))
]).catch(err => console.log(err.errors)); // ['a', 'b']
```

## Promise vs Callback Comparison

| Aspect | Callback | Promise |
|--------|----------|---------|
| Inversion of Control | Yes - you hand control to another function | No - you retain control via `.then()` |
| Error Handling | Must check error parameter in every callback | `.catch()` catches all errors in chain |
| Chaining | Callback hell / pyramid of doom | Natural `.then()` chaining |
| Composability | Difficult to compose | Easy with `Promise.all()`, `Promise.race()`, etc. |
| Timing | Depends on implementation | Predictable state transitions |

### Callback Hell Example

```javascript
fs.readFile('file1.txt', (err, data1) => {
  if (err) throw err;
  fs.readFile('file2.txt', (err, data2) => {
    if (err) throw err;
    fs.readFile('file3.txt', (err, data3) => {
      if (err) throw err;
      // Deep nesting!
    });
  });
});
```

### Promise Chain Example

```javascript
fs.promises.readFile('file1.txt')
  .then(data1 => fs.promises.readFile('file2.txt'))
  .then(data2 => fs.promises.readFile('file3.txt'))
  .then(data3 => /* handle all data */)
  .catch(err => console.error(err));
```

## Advanced: Creating Thenables

A thenable is any object with a `.then()` method. Promises can work with any thenable:

```javascript
const thenable = {
  then(onFulfill, onReject) {
    // Can be sync or async
    onFulfill('value');
  }
};

Promise.resolve(thenable).then(val => console.log(val)); // 'value'
```

This is how async/await desugars - it uses the thenable protocol.

## Advanced: Executor Function

The function passed to `new Promise()` is called the **executor**. It runs:

1. **Immediately** and **synchronously** when the Promise is created
2. Before any other code on that tick

```javascript
console.log('1');
const p = new Promise((resolve) => {
  console.log('2'); // Runs immediately
  resolve('done');
});
console.log('3');
p.then(val => console.log('4'));

console.log('5');
// Output: 1, 2, 3, 5, 4
```

## Summary

- Promises have three states: pending, fulfilled, rejected
- Once settled, a Promise's state cannot change
- `.then()` always returns a new Promise
- Promise callbacks are microtasks with higher priority than macrotasks
- Error propagation works through the chain via `.catch()`
- Promise static methods (`all`, `race`, `any`, `allSettled`) provide powerful composition
