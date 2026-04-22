# Node.js 中 pipeline() vs pipe()

> **架构视角**：`pipe()` 和 `pipeline()` 代表两种不同的**资源管理理念**：最小开销 vs 生产级弹性。选择是关于谁拥有错误传播和清理的架构决策。

## 基本区别

| 方面 | `pipe()` | `pipeline()` |
|------|----------|--------------|
| 错误传播 | 静默失败 | 显式回调/destroy |
| 错误时资源清理 | ❌ 泄漏流 | ✅ 销毁所有流 |
| 多流链 | ❌ 仅 2 个流 | ✅ N 个流 |
| 完成信号 | ❌ 无 | ✅ 回调 / Promise |
| 生产可用性 | ⚠️ 需要手动防护 | ✅ 内置 |

## pipe()：最小化、脆弱的组合

```javascript
readable.pipe(writable, { end: true });
```

### pipe() 做什么

- 连接 readable → writable
- 返回**目标**流
- `end: true`（默认）：当 readable 结束时结束 writable

### pipe() 不做什么

```
readable ──▶ writable

If readable.errors ──▶ writable is left open (memory leak)
If writable.errors ──▶ readable continues reading into void
```

**这是核心架构弱点**：`pipe()` 假设两个端点都是良好行为且永恒的。在生产环境中，任一端都可能失败。

### 失败模式

```javascript
readable.pipe(writable);
// Problem: readable error leaves writable hanging

readable.on('error', (err) => {
  // writable never closed, port/socket leaked
  console.error(err);
});
```

**架构后果**：`pipe()` 需要在两端手动错误处理。每个 `pipe()` 站点需要：

```javascript
readable.pipe(writable);

readable.on('error', (err) => {
  writable.destroy(); // clean up partner
});

writable.on('error', (err) => {
  readable.destroy(); // stop reading
});
```

这种样板容易出错且经常被遗忘。

## pipeline()：生产级组合

```javascript
const { pipeline } = require('stream');

pipeline(
  readable,
  transform1,
  transform2,
  writable,
  (err) => {
    if (err) {
      console.error('Pipeline failed:', err);
    }
    // All streams destroyed, resources freed
  }
);
```

### pipeline() 做什么

- 按顺序连接 N 个流
- 将任何流的**错误转发**到回调
- 任何错误时**销毁**链中的所有流
- 成功时**正确结束**所有流
- 返回目标流（像 `pipe()`）

### pipeline() 中的错误流

```
readable ──▶ transform1 ──▶ transform2 ──▶ writable

If transform2.errors:
  1. Error propagates to callback
  2. readable.destroy() called
  3. transform1.destroy() called
  4. transform2.destroy() called
  5. writable.destroy() called
  6. Callback invoked with error
```

**所有资源释放。无泄漏。**

### Promise 支持（Node 10+）

```javascript
const { pipeline } = require('stream');
const { promisify } = require('util');

const pipe = promisify(pipeline);

// async/await 风格
async function processFile(input, output) {
  await pipe(
    fs.createReadStream(input),
    zlib.createGzip(),
    fs.createWriteStream(output)
  );
  // OR
  return new Promise((resolve, reject) => {
    pipeline(readable, writable, (err) => err ? reject(err) : resolve());
  });
}
```

## 架构比较

### 错误处理模型

```
pipe():
  readable ──▶ writable
       │            │
       ▼            ▼
   error out    error out
   (separate   (separate
    handlers)    handlers)
   ❌ No coordination between handlers

pipeline():
  readable ──▶ transform ──▶ writable
       │            │           │
       └────────────┴───────────┘
              │
              ▼
         single callback
         with full error
         + stream cleanup
```

**决策**：`pipeline()` 集中错误处理 — 单个回调接收所有错误，清理自动进行。这是**观察者模式**在流组合中的应用。

### 资源生命周期所有权

| 生命周期事件 | `pipe()` | `pipeline()` |
|-----------------|----------|--------------|
| 成功完成 | Writable 结束（如果 `end: true`） | 所有流结束 |
| Readable 错误 | Writable 保持打开 ⚠️ | 所有流销毁 |
| Writable 错误 | Readable 继续 ⚠️ | 所有流销毁 |
| 意外关闭 | 无清理 | 所有流销毁 |

## 何时使用

### 使用 `pipe()` 当：

```javascript
// 场景：简单的、短命的、良好控制的
// 示例：脚本中的一次性文件复制
fs.createReadStream('input.txt').pipe(fs.createWriteStream('output.txt'));

// 这些流是：
  // - 都是本地的、可信的对象
  // - 保证会完成
  // - 没有可能出错的外部消费者
  // - 错误在更高级别处理（进程级）
```

**架构**：可接受用于内部脚本，不用于处理真实流量的服务。

### 使用 `pipeline()` 当：

```javascript
// 场景：处理 I/O 的生产服务
// 示例：带压缩的 HTTP 响应流
const { pipeline } = require('stream');
const { createGzip } = require('zlib');

pipeline(
  fs.createReadStream(filePath),
  createGzip(),
  response,  // HTTP response writable
  (err) => {
    if (err) {
      console.error('Streaming failed', err);
      // response.destroy() called automatically
      // fs stream destroyed automatically
    }
    // Resources always released
  }
);

// 场景：多个 transforms
pipeline(
  request,
  authenticate,
  validate,
  transform,
  respond,
  (err) => { /* cleanup */ }
);
```

**架构**：对于任何超过 2 个流的链、任何生产 I/O、任何涉及外部客户端的场景，都是强制的。

## 异步迭代器集成（Node 12+）

`pipeline()` 接受异步迭代器作为源或目标：

```javascript
const { pipeline } = require('stream');

async function* generateChunks() {
  for await (const row of db.query('SELECT * FROM large_table')) {
    yield JSON.stringify(row);
  }
}

await pipeline(
  generateChunks(),
  createTransformStream(),
  fs.createWriteStream('output.jsonl')
);
// 背压通过异步迭代器协议工作
```

**架构**：`pipeline()` 桥接 push（流）和 pull（异步迭代器）模型 — 对于混合 DB 查询、文件 I/O 和 HTTP 流至关重要。

## finished() 辅助函数：组合外的生命周期观察

当你只需要观察流完成而不需要组合时：

```javascript
const { finished } = require('stream');

finished(readable, (err) => {
  // Called whether stream ended, errored, or was destroyed
  console.log('Readable lifecycle ended:', err);
});
```

**使用场景**：与外部库集成（它们管理自己的流），或对流生命周期进行日志/指标记录。

## 决策矩阵

| 标准 | `pipe()` | `pipeline()` |
|------|----------|--------------|
| 生产 HTTP 处理器 | ❌ | ✅ |
| 文件处理管道 | ❌ | ✅ |
| 简单脚本 | ✅ | ✅ |
| 流 < 2 跳 | ✅ | ✅ |
| 外部/不可信流 | ❌ | ✅ |
| 需要 Promise/async-await | ❌ | ✅ |
| 错误安全组合 | ❌ | ✅ |

**规则**：默认使用 `pipeline()`。仅当你有单个、受控的 read→write 对且 Node < 10 时才降级到 `pipe()`。

## 反模式

```javascript
// ❌ 生产环境中没有错误处理的 pipe()
readable.pipe(writable);

// ✅ 显式错误，显式清理
readable.pipe(writable);
readable.on('error', (err) => writable.destroy());
writable.on('error', (err) => readable.destroy());

// ✅ pipeline() — 自动的
pipeline(readable, writable, (err) => {
  if (err) console.error(err);
});

// ❌ 多个 transforms 的 pipe() — 错误泄漏
readable.pipe(t1).pipe(t2).pipe(writable);
// t1 error → t2 and writable leak

// ✅ 多个 transforms 的 pipeline()
pipeline(readable, t1, t2, writable, (err) => { /* all cleaned up */ });
```

**架构教训**：`pipeline()` 不仅仅是带回调的 `pipe()`。它是一个**不同的契约** — 系统拥有资源清理，而非调用者。
