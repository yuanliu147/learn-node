# Async/Await 异步函数

## 概述

Async/await 是 Promises 的语法糖，使异步代码看起来更像同步代码。引入于 ES2017，它为管理 JavaScript 中的异步操作提供了一种架构选择。

**架构视角**：Async/await 代表了一种声明式的异步控制流方法，以一定的细粒度控制换取更好的可读性和可维护性。理解何时使用它（何时不使用）是一个关键的架构决策。

## 解决什么问题

### Promise 链问题

原始 Promise 链变得笨拙：

```javascript
// 难以阅读：3 层嵌套
fetch('/api/user')
  .then(user => fetch(`/api/posts/${user.id}`))
  .then(posts => fetch(`/api/comments/${posts[0].id}`))
  .then(comments => console.log(comments))
  .catch(err => console.error(err));
```

### 回调金字塔

Async/await 将其展平为线性代码：

```javascript
// 易读：顺序、线性流程
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

## 架构

### 执行模型

```
┌─────────────────────────────────────────────────────────────┐
│                    调用站点                                  │
│  async function demo() {                                   │
│    console.log('1');                                      │
│    await promise;  ◄─── 仅暂停此函数                      │
│    console.log('3');                                      │
│  }                                                         │
│                                                               │
│  console.log('2');  ←── 主线程继续                        │
│  demo();                                                   │
│  console.log('4');  ←── 在 '3' 之前运行                   │
└─────────────────────────────────────────────────────────────┘
```

### 与 Promise 的关系

Async/await 编译为 Promise 链：

```javascript
// 你写的：
async function example() {
  const a = await Promise.resolve(1);
  const b = await Promise.resolve(2);
  return a + b;
}

// 它变成的（简化版）：
function example() {
  return Promise.resolve(1)
    .then(a => Promise.resolve(2).then(b => a + b));
}
```

### 状态机转换

编译器将 async 函数转换为状态机：

```javascript
// 你的代码：
async function foo() {
  const x = await fetchX();
  const y = await fetchY();
  return x + y;
}

// 生成的状态机（简化版）：
let state = 0; // 0=开始, 1=等待x, 2=等待y, 3=完成

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

## 优势

| 优势 | 描述 |
|------|------|
| **可读性** | 代码像同步步骤一样阅读，减少认知负担 |
| **错误处理** | try/catch 像同步代码一样工作——没有 `.catch()` 链 |
| **调试** | 逐步调试自然工作；断点逐行命中 |
| **堆栈跟踪** | 比原始 Promise 链更好的堆栈跟踪 |
| **控制流** | 自然表达顺序依赖 |

## 劣势

| 劣势 | 描述 |
|------|------|
| **开销** | 与原始 Promise 链相比略有性能成本（状态机创建） |
| **失去细粒度控制** | 不能轻松取消、暂停或检查进行中的异步操作 |
| **并行性模糊** | 容易意外写出顺序代码而本意是并行 |
| **阻塞语义** | `await` 可能让不熟悉的人误以为"阻塞"（其实不会） |
| **错误堆栈复杂性** | 当 await 链跨越微任务时，错误可能有令人困惑的堆栈 |

## 适用场景

### ✅ 适合：顺序依赖

当每一步依赖前一步时：

```javascript
async function getUserDashboard(userId) {
  const user = await fetchUser(userId);      // 首先需要 user
  const permissions = await fetchPerms(user.role);  // 依赖 user
  const dashboard = await buildDashboard(user, permissions); // 依赖两者
  return dashboard;
}
```

### ✅ 适合：错误传播

当你想要集中式错误处理时：

```javascript
async function processOrder(orderId) {
  try {
    const order = await validateOrder(orderId);
    const payment = await chargePayment(order);
    const shipment = await createShipment(order);
    return { order, payment, shipment };
  } catch (error) {
    // 所有错误都到这里——不需要 .catch() 链
    await logError(error);
    throw error;
  }
}
```

### ❌ 不适合：即发即弃

当你不在乎结果时：

```javascript
// 浪费：创建不必要的异步机制
async function notifyUsers() {
  await sendEmail();  // 等待 email 是不必要的
}

// 更好：即发即弃
function notifyUsers() {
  sendEmail();  // 返回 Promise 但我们不 await
  return;       // 立即返回
}
```

### ❌ 不适合：高度动态并发

当你需要对许多并行操作进行细粒度控制时：

```javascript
// await 使这变得尴尬
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

// 考虑：使用专用的并发库或生成器代替
```

## 选择决策

### 选择 Async/Await 当：

1. **线性依赖链**：A → B → C，每步都需要前一步
2. **集中式错误处理**：try/catch 覆盖所有操作
3. **优先可读性**：团队熟悉此模式
4. **标准 CRUD 操作**：数据库调用、API 请求、文件 I/O
5. **中间件/过滤器模式**：请求的顺序处理

### 选择原始 Promises 当：

1. **纯并行操作**：任务之间没有依赖
2. **细粒度控制**：需要检查、取消或组合 futures
3. **性能关键路径**：每一微秒都很重要（罕见）
4. **库代码**：不想对消费者施加 async/await
5. **流式/分块处理**：基于生成器的模式

### 混合方法

根据上下文混合：

```javascript
class DataService {
  // 使用 async/await 以获得可读的方法体
  async fetchUserData(userId) {
    const [user, posts, preferences] = await Promise.all([
      this.fetchUser(userId),
      this.fetchPosts(userId),
      this.fetchPreferences(userId)
    ]);
    
    // 使用原始 Promise 进行条件逻辑
    return this.calculateScore(user, posts, preferences)
      .then(score => ({ user, posts, preferences, score }));
  }
}
```

## 常见误解

### 误解 1："Await 阻塞线程"

**错误**：`await` 像 sleep 一样暂停 JavaScript 执行。

**正确**：`await` 仅暂停 async 函数。主线程继续。

```javascript
async function demo() {
  console.log('1');
  await new Promise(r => setTimeout(r, 100));
  console.log('3'); // 100ms 后运行，但主代码继续
}

console.log('2');
demo();
console.log('4');

// 输出：2, 1, 4, 3（不是 2, 1, 3, 4）
```

### 误解 2：顺序 vs 并行

**错误**：`.map()` 中的 `await` 是并行运行的。

**正确**：`.map()` 中的 `await` 仍然是顺序运行，除非与 `Promise.all()` 结合。

```javascript
// 慢：顺序（总共 3s）
async function slowWay(files) {
  return files.map(async file => {
    return await compress(file); // 每个都等待前一个！
  });
}

// 快：并行（总共约 1s）
async function fastWay(files) {
  return Promise.all(
    files.map(file => compress(file)) // 不需要 await
  );
}
```

### 误解 3：Return vs Return await

```javascript
// 行为不同！

async function withReturnAwait() {
  try {
    return await fetchData(); // try/catch 捕获错误
  } catch (e) {
    console.error(e);
  }
}

async function withReturn() {
  try {
    return fetchData(); // try/catch 不捕获——返回 rejected Promise
  } catch (e) {
    console.error(e); // 永远不会运行！
  }
}
```

### 误解 4：Async 箭头函数

```javascript
// 简洁体：隐式返回（没有 await 包装）
const getData = async (url) => fetch(url).then(r => r.json());

// 块体：需要显式返回
const getData = async (url) => {
  const response = await fetch(url);  // 这个 await 有效
  return response.json();
};
```

## 基本语法

### Async 函数

`async` 函数始终返回 Promise：

```javascript
async function fetchData(url) {
  return 'data';
}

// 等价于：
function fetchData(url) {
  return Promise.resolve('data');
}
```

### Await 操作符

`await` 关键字：
- 只能在内 `async` 函数中使用
- 暂停 async 函数执行直到 Promise 解决
- 如果 Promise 履行则返回解析后的值
- 如果 Promise 拒绝则抛出错误

```javascript
async function example() {
  const value = await Promise.resolve(42);
  console.log(value); // 42
}
```

## Await 行为

### 并行 vs 顺序

**顺序**（慢——每个等待前一个）：

```javascript
async function sequential() {
  const a = await fetchA();  // 等待 1s
  const b = await fetchB();  // 等待 1s（a 完成后）
  const c = await fetchC();  // 等待 1s（b 完成后）
  // 总计：约 3s
}
```

**并行**（快——全部立即开始）：

```javascript
async function parallel() {
  const [a, b, c] = await Promise.all([
    fetchA(),  // 所有立即开始
    fetchB(),
    fetchC()
  ]);
  // 总计：约 1s（全部并发运行）
}
```

## 错误处理

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

### 多个 Await 与单一 Try/Catch

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

### 使用 Promise.allSettled 处理部分失败

当你想处理部分失败时使用 `Promise.allSettled`：

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

## 常见模式

### 顺序处理

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

### 限制并发的并行处理

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

### 指数退避重试

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

## 顶级 Await (ES2022)

在 ES 模块中，你可以在顶层使用 await：

```javascript
// module.mjs
const data = await fetch('/api/data').then(r => r.json());
console.log(data);
```

## Async 迭代器 (for await...of)

处理 async 生成器和 async 迭代器：

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

## 常见陷阱

### 忘记 Await

```javascript
// Bug：没有等待保存完成
async function updateUser(id, data) {
  await db.connect();
  db.users.update(id, data); // 缺少 await——Promise 被静默忽略
  return { success: true };
}

// 修复：
async function updateUser(id, data) {
  await db.connect();
  await db.users.update(id, data);
  return { success: true };
}
```

### 在非 Async 函数中使用 Await

```javascript
// SyntaxError: await 只在 async 函数中有效
function broken() {
  const data = await fetchData();
}

// 修复：使函数成为 async
async function fixed() {
  const data = await fetchData();
  return data;
}
```

## 测试理解的问题

1. `await` 何时阻塞主线程，何时只阻塞 async 函数？
2. 为什么 `Promise.all([...items.map(async x => await foo(x))])` 可能比预期慢？
3. async 函数中 `return await` 和 `return` 有什么区别？
4. 何时选择原始 Promises 而不是 async/await？
5. async/await 与事件循环阶段有什么关系？

## 总结

- **解决的问题**：冗长的 Promise 链和回调金字塔
- **权衡**：以可读性换取细粒度控制
- **最适合**：顺序依赖、集中式错误处理
- **避免用于**：即发即忘、高度动态并发
- **关键见解**：`await` 只暂停 async 函数，而不是整个程序
- **性能**：与原始 Promises 相比略有开销；使用 `Promise.all()` 实现并行
