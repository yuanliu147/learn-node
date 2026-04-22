# Node.js 中的回调

## 概述

回调是作为参数传递给另一个函数的函数，稍后被调用以完成异步操作。回调是 Node.js 中处理异步操作的原始模式。

## 回调模式

### 基本语法

```javascript
function asyncOperation(params, callback) {
  // 执行异步工作
  setTimeout(() => {
    if (/* 成功 */) {
      callback(null, result);  // Node 约定：错误优先
    } else {
      callback(new Error('Failed'), null);
    }
  }, 100);
}

// 用法
asyncOperation('data', (err, result) => {
  if (err) {
    console.error('Error:', err.message);
    return;
  }
  console.log('Result:', result);
});
```

## 错误优先回调

Node.js 约定：回调始终将错误作为第一个参数接收：

```javascript
// 签名：callback(error, result)
fs.readFile('file.txt', (err, data) => {
  if (err) {
    // 处理错误
    console.error('Read failed:', err.message);
    return;
  }
  // 处理成功
  console.log('File contents:', data.toString());
});
```

### 为什么错误优先？

1. **一致性** - 所有 Node.js 回调遵循相同模式
2. **错误处理** - 错误不能被意外忽略
3. **可选结果** - 可以在访问结果之前检查是否存在错误
4. **堆栈跟踪** - 错误可以从异步边界携带堆栈跟踪

## 回调地狱（末日金字塔）

嵌套回调创建"回调地狱"：

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

### 回调地狱的问题

1. **可读性** - 难以跟踪执行流程
2. **错误处理** - 必须在每个级别处理错误
3. **维护** - 代码难以修改
4. **调试** - 堆栈跟踪用处较小

## 回调地狱的解决方案

### 1. 命名函数

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

### 2. Async 库

使用 `async` 模块：

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

### 3. Promises（推荐）

```javascript
const fs = require('fs').promises;

async function main() {
  const config = JSON.parse(await fs.readFile('config.json'));
  const connection = await db.connectPromise(config.db);
  const users = await connection.queryPromise('SELECT * FROM users');
  return users;
}
```

### 4. Async/Await（最可读）

```javascript
const fs = require('fs').promises;

async function main() {
  const config = JSON.parse(await fs.readFile('config.json'));
  const connection = await db.connectPromise(config.db);
  const users = await connection.queryPromise('SELECT * FROM users');
  return users;
}
```

## 同步 vs 异步回调

### 同步回调

```javascript
const numbers = [1, 2, 3, 4, 5];

numbers.forEach((num) => {
  console.log(num);  // 立即、同步运行
});
```

### 异步回调

```javascript
const fs = require('fs');

console.log('1: before readFile');

fs.readFile('file.txt', (err, data) => {
  console.log('3: inside callback');
});

console.log('2: after readFile');

// 输出：
// 1: before readFile
// 2: after readFile
// 3: inside callback
```

## Node.js 中常见的回调模式

### 单操作回调

```javascript
function delay(ms, callback) {
  setTimeout(() => {
    callback(null, 'done');
  }, ms);
}
```

### Nodeback 风格（Node.js 风格回调）

```javascript
// 标准签名
function nodeStyleFunction(arg1, arg2, callback) {
  // callback(error, result)
}

nodeStyleFunction('a', 'b', (err, result) => {
  if (err) return handleError(err);
  useResult(result);
});
```

### 将回调转换为 Promises

```javascript
// 手动转换
function promisedFunction(arg) {
  return new Promise((resolve, reject) => {
    originalFunction(arg, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// 使用 util.promisify（Node.js 内置）
const { promisify } = require('util');
const readFilePromise = promisify(fs.readFile);

// 使用 fs.promises
const readFile = fs.promises.readFile;
```

## 回调中的 this 上下文

### this 的问题

```javascript
const myObject = {
  name: 'myObject',
  
  fetchData(callback) {
    someAsyncOperation((err, data) => {
      // Bug：这里的 this 不是 myObject
      console.log(this.name); // undefined 或错误
    });
  }
};
```

### 解决方案

**解决方案 1：Bind**

```javascript
fetchData(callback) {
  someAsyncOperation((err, data) => {
    console.log(this.name);
  }.bind(this));
}
```

**解决方案 2：箭头函数**

```javascript
fetchData(callback) {
  someAsyncOperation((err, data) => {
    console.log(this.name); // 有效 - 箭头保留 this
  });
}
```

**解决方案 3：作为第二个参数传递**

```javascript
fetchData(callback) {
  const self = this;
  someAsyncOperation(function(err, data) {
    console.log(self.name); // self 保留 this
  });
}
```

## 回调中的错误处理

### 在每个级别处理错误

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

### 错误传播

错误不会通过回调自动传播——必须显式传递：

```javascript
// 错误被传播
function badRead(file, callback) {
  fs.readFile(file, (err, data) => {
    if (err) callback(err); // 错误传递给回调
    callback(null, data);
  });
}

// 错误没有被传播（常见 bug！）
function reallyBadRead(file, callback) {
  fs.readFile(file, (err, data) => {
    if (err) throw err; // 抛到虚空中 - 回调从未被调用
    callback(null, data);
  });
}
```

## 回调 vs Promise vs Async/Await

| 方面 | 回调 | Promises | Async/Await |
|------|------|----------|-------------|
| 可读性 | 嵌套/难以跟踪 | 可链式调用 | 顺序/线性 |
| 错误处理 | 手动/检查 err 参数 | .catch() | try/catch |
| 组合 | 手动 | .all(), .race() | Promise.all |
| 控制流 | 控制反转 | 保留控制 | 看起来同步 |
| 堆栈跟踪 | 差 | 更好 | 最好 |
| 调试 | 困难 | 更容易 | 最容易 |

## 今天何时使用回调

回调仍然用于：

1. **遗留 Node.js API** - 许多核心模块仍有回调 API
2. **事件发射器** - `emitter.on('event', callback)`
3. **流** - `stream.on('data', callback)`
4. **第三方库** - 一些库尚未更新

现代代码应该优先使用 Promises 或 async/await。

## 总结

- Node.js 使用错误优先回调：`callback(error, result)`
- 回调可以是同步或异步的
- 嵌套回调导致"回调地狱"——使用命名函数、async 库或 Promises
- 箭头函数解决了回调中的 `this` 绑定问题
- 在回调中始终显式处理错误
- 现代 Node.js 代码应该优先使用 Promises/async-await
