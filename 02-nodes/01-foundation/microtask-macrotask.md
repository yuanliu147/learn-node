---
title: "Node.js 中的微任务与宏任务"
description: "理解任务队列：Promise 回调、queueMicrotask、process.nextTick、setTimeout、setImmediate"
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

# Node.js 中的微任务与宏任务

理解微任务和宏任务之间的区别对于预测 Node.js 中异步代码的执行顺序至关重要。这一知识有助于调试微妙的顺序 bug 并编写可预测的异步代码。

## 什么是任务？

JavaScript 执行是单线程的。**事件循环**通过**任务**（宏任务）和**微任务**来调度工作。关键区别在于它们相对于彼此和主脚本**何时**执行。

## 微任务

**微任务**是与当前执行上下文关联的短运行任务。它们比宏任务具有**更高优先级**。

### 微任务的来源

1. **Promise 回调**（`then`、`catch`、`finally`）
2. **`queueMicrotask()`** API
3. **`process.nextTick()`**（Node.js 特有——技术上比 promise 微任务优先级更高）

### 微任务队列处理规则

在当前同步代码段完成之后、返回控制给事件循环之前：

1. 执行队列中的所有微任务
2. 这包括微任务处理*期间*添加的微任务
3. 在下一个宏任务运行之前，微任务队列被完全清空

```javascript
Promise.resolve()
  .then(() => console.log('promise 1'))
  .then(() => console.log('promise 2'))
  .then(() => console.log('promise 3'));

// 输出：
// promise 1
// promise 2
// promise 3
```

每个 `.then()` 返回一个新 promise，后续的 `.then()` 仅在前一个解决后才入队。

## 宏任务

**宏任务**（也称为"任务"或"宏任务"）是标准事件循环工作项。每个事件循环阶段处理其自己的宏任务队列。

### 宏任务的来源

1. **`setTimeout()`**
2. **`setInterval()`**
3. **`setImmediate()`**
4. **I/O 回调**（来自 poll 阶段）
5. **`requestAnimationFrame`**（浏览器，非 Node.js）

## 执行顺序

每个事件循环 tick 中的规范顺序：

```
┌─────────────────────────────────────────────────────────────┐
│                        调用栈                                │
│                    (同步代码)                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    微任务队列                               │
│  • process.nextTick() 回调                                  │
│  • Promise .then() / catch() / finally() 回调              │
│  • queueMicrotask() 回调                                    │
│                                                             │
│  ⚠️ 在任何宏任务运行之前完全清空                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      宏任务队列                             │
│  • setTimeout / setInterval 回调                            │
│  • setImmediate 回调                                        │
│  • I/O 回调                                                │
│  •（每个周期一个宏任务，除非 poll 阶段处于活动状态）         │
└─────────────────────────────────────────────────────────────┘
```

## 详细示例

### 示例 1：基本微任务 vs 宏任务

```javascript
console.log('1. 同步');

setTimeout(() => console.log('2. setTimeout'), 0);

Promise.resolve()
  .then(() => console.log('3. promise .then'));

queueMicrotask(() => console.log('4. queueMicrotask'));

process.nextTick(() => console.log('5. process.nextTick'));

console.log('6. 同步结束');
```

**输出**：
```
1. 同步
6. 同步结束
5. process.nextTick    ← nextTick 在其他微任务之前运行
4. queueMicrotask      ← queueMicrotask 是一个微任务
3. promise .then        ← promise .then 是一个微任务
2. setTimeout          ← setTimeout 是一个宏任务
```

**为什么？** 主脚本完成后，微任务队列首先被清空——`process.nextTick`（Node.js 中最高优先级），然后是 `queueMicrotask`，然后是 Promise 回调。只有这样，事件循环才会进入 timers 阶段处理 `setTimeout`。

### 示例 2：宏任务内部的微任务

```javascript
setTimeout(() => {
  console.log('1. setTimeout 开始');
  Promise.resolve()
    .then(() => console.log('2. setTimeout 内部的 promise'));
  process.nextTick(() => console.log('3. setTimeout 内部的 nextTick'));
  console.log('4. setTimeout 结束');
}, 0);

setTimeout(() => {
  console.log('5. 第二个 setTimeout');
}, 0);
```

**输出**：
```
1. setTimeout 开始
4. setTimeout 结束
3. nextTick inside setTimeout    ← 来自宏任务内部的 nextTick
2. promise inside setTimeout     ← 来自宏任务的 promise
5. second setTimeout             ← 微任务在宏任务之后运行
```

**为什么？** 当第一个 `setTimeout` 回调执行时，同步的 `console.log` 首先运行。那个宏任务回调完成后，微任务队列被清空，然后才运行下一个宏任务——所以第一个 timeout 内部的 `process.nextTick` 和 promise 回调在第二个 timeout 之前执行。

### 示例 3：process.nextTick vs Promise 微任务

```javascript
process.nextTick(() => {
  console.log('1. nextTick');
  process.nextTick(() => console.log('2. 嵌套 nextTick'));
});

Promise.resolve()
  .then(() => console.log('3. promise'));

process.nextTick(() => {
  console.log('4. promise.then 之后的 nextTick');
});
```

**输出**：
```
1. nextTick
2. nextTick 嵌套
4. nextTick 在 promise.then 之后
3. promise
```

**重要**：在 Node.js 中，`process.nextTick()` 回调在 Promise 微任务**之前**运行。这是 Node.js 特有的行为——浏览器在 `queueMicrotask()` 之前运行 promise 回调，但 `process.nextTick()` 是 Node.js 独有的，优先级更高。

### 示例 4：async/await 与微任务

```javascript
async function example() {
  console.log('1. async 函数开始');
  await Promise.resolve();
  console.log('2. await 之后');
  await Promise.resolve();
  console.log('3. 第二个 await 之后');
}

example();

Promise.resolve()
  .then(() => console.log('4. promise.then'));
```

**输出**：
```
1. async 函数开始
4. promise.then           ← Promise 微任务在 await 继续之前运行
2. after await
3. after second await
```

**为什么？** `await` 暂停函数并将继续调度为微任务。第一个 `await` 在 promise 解决后调度继续，但 `Promise.resolve()` 立即解决，所以它的 `.then()`（微任务）在 async 函数继续之前运行。

## Node.js 特有：process.nextTick() 队列 vs 微任务队列

Node.js 实际上维护**两个**独立的微任务类队列：

1. **`process.nextTick()` 队列** — 在每个阶段之后、微任务队列之前处理
2. **原生 promise 微任务队列** — 在 nextTick 队列之后处理

Node.js 中每个事件循环 tick 的顺序：
```
nextTick 队列 (process.nextTick)
→ 微任务队列 (Promises, queueMicrotask)
→ 下一个宏任务
```

```javascript
process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise'));
queueMicrotask(() => console.log('queueMicrotask'));
```

**Node.js 中的输出**：
```
nextTick
queueMicrotask
promise
```

在浏览器中（使用 `queueMicrotask` 和 promise），顺序通常是 `queueMicrotask` 然后是 promise，但 `process.nextTick` 是 Node.js 独有的。

## queueMicrotask() API

`queueMicrotask()` 是一个标准 API，在浏览器和 Node.js 中都可用，用于显式入队微任务：

```javascript
queueMicrotask(() => {
  console.log('这作为微任务运行');
});
```

使用场景：
- 安全地延迟工作而不使用异步 I/O
- 确保在下次渲染之前运行（浏览器）
- 将函数的副作用隔离到微任务检查点

## 常见陷阱

### 忘记微任务阻塞队列

```javascript
// 这创建了一个无限微任务循环
let i = 0;
function tick() {
  Promise.resolve().then(() => {
    i++;
    if (i < 1000000) tick(); // 不断添加微任务！
  });
}
```

### 依赖 nextTick 和 Promises 之间的特定顺序

```javascript
// 不可靠的模式 - nextTick 顺序是实现细节
process.nextTick(async () => {
  // async 的 nextTick 行为可能令人惊讶
});
```

### 用微任务阻塞

```javascript
// 不好：同步无限循环阻止微任务永远运行
while (true) {
  // 阻塞一切
}
```

## 何时使用什么

| API | 类型 | 使用场景 |
|-----|------|----------|
| `process.nextTick()` | Node.js 微任务 | 拆分长同步操作，确保执行顺序 |
| `queueMicrotask()` | 标准微任务 | 可移植的微任务入队 |
| `Promise.then/catch/finally` | 微任务 | 链接异步操作 |
| `setTimeout(fn, 0)` | 宏任务 | 将工作延迟到下一个事件循环周期 |
| `setImmediate()` | 宏任务 | 在 I/O 事件之后执行 |

## 关键要点

1. **微任务在同一事件循环 tick 中先于宏任务执行**
2. **`process.nextTick()`** 在 Node.js 中比 Promise 微任务优先级更高
3. **`queueMicrotask()`** 是入队微任务的标准方式
4. **微任务队列在下一个宏任务运行之前完全清空**（包括微任务处理期间添加的微任务）
5. 理解微任务/宏任务顺序对于调试异步竞态条件至关重要

## 参考

- [MDN: queueMicrotask()](https://developer.mozilla.org/en-US/docs/Web/API/queueMicrotask)
- [Node.js process.nextTick()](https://nodejs.org/api/process.html#process_process_nexttick_callback_args)
- [WHATWG HTML 规范：JavaScript 执行上下文](https://html.spec.whatwg.org/multipage/webappapis.html#task-queue)
