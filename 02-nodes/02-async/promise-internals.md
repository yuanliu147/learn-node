---
id: promise-internals
title: Promise 内部原理
difficulty: L4
tags: ["promise", "async", "microtask", "state-machine"]
prerequisites: ["microtask-macrotask"]
related: ["async-await-transform", "concurrency-patterns"]
interview_hot: true
ai_confidence: 4
version: 2.0
last_updated: 2026-04-21
human_verified: false
todo:
  - 添加 Promise.any 和 Promise.allSettled 的实现
  - 补充与浏览器 Promise 的差异
---

# Promise 内部原理

## 一句话定义

> Promise 是 **状态机** + **回调容器**，封装了异步操作的最终结果（值或错误），并通过 `.then()` / `.catch()` 链式调用提供统一的异步编程接口。

---

## 解决什么问题

### 核心问题：回调地狱（Callback Hell）

```
回调地狱示例：
fs.readFile('a.json', (err, a) => {
  if (err) throw err;
  fs.readFile('b.json', (err, b) => {
    if (err) throw err;
    fs.readFile('c.json', (err, c) => {
      if (err) throw err;
      // ... 更多嵌套
    });
  });
});

// 问题：
// 1. 错误处理重复
// 2. 缩进越来越深
// 3. 代码难以阅读和维护
// 4. 无法 return 值
// 5. 无法 try/catch
```

### Promise 解决方案

```javascript
// Promise 链式调用
fs.readFile('a.json')
  .then(a => fs.readFile('b.json'))
  .then(b => fs.readFile('c.json'))
  .then(c => console.log(JSON.parse(c)))
  .catch(err => console.error(err)); // 统一错误处理

// async/await（Promise 语法糖）
async function readAll() {
  try {
    const a = await fs.promises.readFile('a.json');
    const b = await fs.promises.readFile('b.json');
    const c = await fs.promises.readFile('c.json');
    return JSON.parse(c);
  } catch (err) {
    console.error(err);
  }
}
```

### Promise 解决了什么

| 问题 | Promise 解决方案 |
|------|------------------|
| 嵌套过深 | `.then()` 链式展平 |
| 错误处理分散 | `.catch()` 统一处理 |
| 返回值困难 | `.then()` return 值 |
| 无法 try/catch | async/await 语法糖 |
| 信任问题（回调多次调用） | 状态机保证只调用一次 |

---

## 架构设计

### Promise 状态机

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Promise 状态机                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                         ┌───────────────┐                           │
│                         │    pending    │  ← 初始状态               │
│                         │  (待定状态)   │                           │
│                         └───────┬───────┘                           │
│                                 │                                    │
│            ┌────────────────────┼────────────────────┐               │
│            │                    │                    │               │
│            │ resolve(value)     │ reject(reason)     │               │
│            │ (value 可以是      │ (reason 是错误     │               │
│            │  另一个 Promise)   │  对象)              │               │
│            │                    │                    │               │
│            ▼                    ▼                    │               │
│     ┌───────────────┐   ┌───────────────┐         │               │
│     │   fulfilled   │   │   rejected    │         │               │
│     │  (已实现状态)  │   │  (已拒绝状态)  │         │               │
│     │               │   │               │         │               │
│     │  只读状态！    │   │   只读状态！   │         │               │
│     └───────────────┘   └───────────────┘         │               │
│            │                    │                    │               │
│            │   .then(onFulfilled)                    │               │
│            │────────────────────┼────────────────────│               │
│                                 │                                       │
│                                 ▼                                       │
│                         返回新 Promise                                 │
│                         (继续链式调用)                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Promise 核心属性

```javascript
// Promise 内部结构（简化版）
class Promise {
  // 状态：pending | fulfilled | rejected
  // 注意：状态只读，一旦变更不可逆
  [[PromiseState]] = 'pending';
  
  // 结果值：resolved value 或 rejected reason
  [[PromiseResult]] = undefined;
  
  // 回调队列（then/catch 注册的处理器）
  [[PromiseFulfillReactions]] = [];  // 成功回调队列
  [[PromiseRejectReactions]] = [];   // 失败回调队列
}
```

### .then() 内部机制

```javascript
// Promise.prototype.then 简化实现
Promise.prototype.then = function(onFulfilled, onRejected) {
  // 1. 创建新的 Promise
  const newPromise = new Promise((resolve, reject) => {
    
    // 2. 根据当前 Promise 状态处理
    switch (this[[PromiseState]]) {
      case 'fulfilled':
        // 微任务：确保异步执行
        queueMicrotask(() => {
          try {
            const result = onFulfilled(this[[PromiseResult]]);
            // 3. 处理返回值（可能是另一个 Promise）
            resolve(result);
          } catch (err) {
            reject(err);
          }
        });
        break;
        
      case 'rejected':
        queueMicrotask(() => {
          try {
            const result = onRejected(this[[PromiseResult]]);
            resolve(result); // 注意：.catch 也返回 resolved
          } catch (err) {
            reject(err);
          }
        });
        break;
        
      case 'pending':
        // 4. 状态 pending，排队等待
        this[[PromiseFulfillReactions]].push({
          onFulfilled,
          onRejected,
          resolve,
          reject
        });
        break;
    }
  });
  
  return newPromise;
};
```

### Promise 链式调用的原理

```javascript
// .then() 总是返回新的 Promise
// 这就是链式调用的基础

const p = new Promise((resolve) => resolve(1));

const p2 = p.then(x => x + 1);  // 返回新 Promise
const p3 = p2.then(x => x + 2); // 继续返回新 Promise

// 等价于：
p
  .then(x => x + 1)
  .then(x => x + 2)
  .then(x => console.log(x)); // 输出 4

// 内部链式机制：
// p ──► p2 ──► p3 ──► p4 ──► ...
//        │      │      │
//       then   then   then
```

### 错误传播机制

```javascript
Promise.resolve(1)
  .then(x => {
    throw new Error('Oops!');  // 抛出错误
  })
  .then(x => x + 1)           // 跳过（因为前一个 rejected）
  .catch(err => {
    console.error(err);        // 捕获错误
    return -1;                 // 返回值使链恢复
  })
  .then(x => console.log(x));  // 输出 -1
```

---

## 优劣势分析

### ✅ 优势

| 优势 | 说明 |
|------|------|
| **统一接口** | 任何异步操作都可以 Promise 化 |
| **链式调用** | 代码扁平化，避免嵌套 |
| **错误传播** | `.catch()` 统一错误处理 |
| **组合能力** | `Promise.all()` / `race()` / `allSettled()` |
| **信任保障** | Promise 只能 resolve/reject 一次 |
| **async/await** | 同步写法处理异步 |

### ❌ 劣势

| 劣势 | 说明 |
|------|------|
| **无法取消** | Promise 创建后无法中途取消 |
| **同步陷阱** | `new Promise((resolve) => resolve(1))` 立即执行 |
| **内存泄漏** | 链式调用长时未处理的 rejection 可能导致内存问题 |
| **调试困难** | async 堆栈不连续 |
| **仍需回调** | `.then()` 本质还是回调 |

### ⚠️ 适用场景

| 场景 | 推荐方案 |
|------|----------|
| 多个并行异步操作 | `Promise.all()` |
| 竞速多个操作 | `Promise.race()` |
| 需要取消 | 不适合 Promise，用 AbortController |
| 同步代码异步化 | `new Promise()` |
| 顺序依赖的异步 | `async/await` |

---

## 代码演示

### 手写 Promise（符合 Promise/A+ 规范）

```javascript
// 简化的 Promise 实现（帮助理解原理）
class MyPromise {
  constructor(executor) {
    this.state = 'pending';
    this.value = undefined;
    this.handlers = []; // [{onFulfilled, onRejected, resolve, reject}]
    
    const resolve = (value) => {
      if (this.state !== 'pending') return;
      this.state = 'fulfilled';
      this.value = value;
      this.handlers.forEach(this.#executeHandlers);
    };
    
    const reject = (reason) => {
      if (this.state !== 'pending') return;
      this.state = 'rejected';
      this.value = reason;
      this.handlers.forEach(this.#executeHandlers);
    };
    
    try {
      executor(resolve, reject);
    } catch (err) {
      reject(err);
    }
  }
  
  #executeHandlers = ({onFulfilled, onRejected, resolve, reject}) => {
    queueMicrotask(() => {
      try {
        if (this.state === 'fulfilled') {
          const result = typeof onFulfilled === 'function' 
            ? onFulfilled(this.value) 
            : this.value;
          resolve(result);
        } else if (this.state === 'rejected') {
          if (typeof onRejected === 'function') {
            resolve(onRejected(this.value)); // .catch 也 resolve
          } else {
            reject(this.value);
          }
        }
      } catch (err) {
        reject(err);
      }
    });
  }
  
  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      this.handlers.push({
        onFulfilled,
        onRejected,
        resolve,
        reject
      });
      if (this.state !== 'pending') {
        this.#executeHandlers(this.handlers[this.handlers.length - 1]);
      }
    });
  }
  
  catch(onRejected) {
    return this.then(null, onRejected);
  }
  
  finally(onFinally) {
    return this.then(
      value => { onFinally(); return value; },
      reason => { onFinally(); throw reason; }
    );
  }
}
```

### Promise.all vs Promise.allSettled

```javascript
// Promise.all - fail-fast
Promise.all([
  Promise.resolve(1),
  Promise.reject(new Error('fail')),  // 立即 reject
  Promise.resolve(3)
]).then(results => console.log(results))
  .catch(err => console.error(err)); // Error: fail

// Promise.allSettled - 等所有完成
Promise.allSettled([
  Promise.resolve(1),
  Promise.reject(new Error('fail')),
  Promise.resolve(3)
]).then(results => {
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[${i}] fulfilled: ${r.value}`);
    } else {
      console.log(`[${i}] rejected: ${r.reason.message}`);
    }
  });
});
```

---

## 常见误区

| 误区 | 正确理解 |
|------|----------|
| ❌ `.then()` 是异步的 | ✅ `.then()` 本身是同步注册，回调通过微任务执行 |
| ❌ `.catch()` 会重新抛出错误 | ✅ `.catch()` 默认返回 resolved Promise |
| ❌ `Promise.resolve()` 创建新 Promise | ✅ 沿用已有 Promise（如果是的话） |
| ❌ `await` 会阻塞线程 | ✅ `await` 只暂停当前 async 函数，事件循环继续 |
| ❌ `finally()` 等于 `.catch()` | ✅ `finally()` 不接收参数，用于清理 |

---

## 面试题

### Q1: 手写一个 Promise.all

```javascript
function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    const results = new Array(promises.length);
    let completed = 0;
    
    if (promises.length === 0) {
      resolve([]);
      return;
    }
    
    promises.forEach((p, i) => {
      Promise.resolve(p).then(
        value => {
          results[i] = value;
          completed++;
          if (completed === promises.length) {
            resolve(results);
          }
        },
        reason => {
          reject(reason);
        }
      );
    });
  });
}
```

### Q2: 解释输出顺序

```javascript
Promise.resolve()
  .then(() => console.log('1'))
  .then(() => console.log('2'));

Promise.resolve()
  .then(() => console.log('3'))
  .then(() => console.log('4'));

// 输出：1 3 2 4（不是 1 2 3 4）
```

**原因**：微任务队列按注册顺序执行，但 `then()` 的回调在当前微任务完成后才注册下一个。

### Q3: async/await 和 Promise 的关系

```javascript
async function foo() {
  return 1;
}

// 等价于：
function foo() {
  return Promise.resolve(1);
}

// 内部转换：
// async function → Generator Function
// await → yield + Promise.then()
```

---

## 延伸阅读

### 官方文档
- [Promise 官方文档](https://nodejs.org/api/promise.html)
- [Promise/A+ 规范](https://promisesaplus.com/)

### 源码位置
- `lib/internal/per_context/primordials.js` — Promise 构造函数
- `lib/internal/bootstrap/node.js` — Promise 微任务设置

---

## 相关节点

- [ async-await-transform ](../02-async/async-await-transform.md) — async/await 转换原理
- [ concurrency-patterns ](../02-async/concurrency-patterns.md) — 并发模式
