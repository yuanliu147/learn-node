---
id: stream-types
title: Stream 类型详解
difficulty: L3
tags: ["stream", "pipe", "backpressure"]
prerequisites: ["event-emitter"]
related: ["backpressure-mechanism", "pipeline-vs-pipe", "object-mode"]
interview_hot: true
ai_confidence: 4
version: 2.0
last_updated: 2026-04-21
human_verified: false
todo:
  - 补充 Streamcombiner 模式
  - 添加 Web Streams API 对比
---

# Stream 类型详解

## 一句话定义

> Stream 是 Node.js 的**数据处理抽象**，用"推（push）"或"拉（pull）"模式处理序列数据，避免内存一次性加载整个数据集。

---

## 解决什么问题

### 核心问题：大文件处理时的内存爆炸

```
传统方式（一次性加载）：
┌─────────────────────────────────────────────────────────────┐
│  readFileSync('huge-file.txt')                              │
│                                                             │
│  文件 (10GB) ════════════════════════════════════════►    │
│                    │                                        │
│                    ▼                                        │
│            ┌──────────────────┐                            │
│            │   全部加载到内存   │  ← 10GB 内存！            │
│            │   一次性读取      │  ← 内存爆炸 OOM            │
│            └──────────────────┘                            │
└─────────────────────────────────────────────────────────────┘

Stream 方式（流式处理）：
┌─────────────────────────────────────────────────────────────┐
│  createReadStream('huge-file.txt')                         │
│                                                             │
│  文件 (10GB) ════════════════════════════════════════►    │
│                    │                                        │
│                    ▼                                        │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                      │
│  │Chunk│→ │Chunk│→ │Chunk│→ │Chunk│  ← 每次只读一块         │
│  │64KB │  │64KB │  │64KB │  │64KB │    (default)          │
│  └─────┘  └─────┘  └─────┘  └─────┘                      │
│                    │                                        │
│                    ▼                                        │
│            ┌──────────────────┐                            │
│            │   处理一块        │  ← 固定内存占用            │
│            │   再读下一块      │  ← 背压机制               │
│            └──────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### 设计哲学

**"能用流处理的，就不要一次性加载"** — 这是 Node.js 处理大数据的基本原则。

- **内存效率**：固定内存，处理 GB 级数据
- **时间效率**：开始处理早于读取完成
- **组合性**：可以用 pipe() 组合多个流

---

## 架构设计

### 四种 Stream 类型

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Stream 类型体系                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                         ┌─────────────────┐                         │
│                         │    Stream       │  (抽象基类)             │
│                         └────────┬────────┘                         │
│                                  │                                   │
│          ┌──────────────────────┼──────────────────────┐            │
│          │                      │                      │            │
│          ▼                      ▼                      ▼            │
│  ┌───────────────┐      ┌───────────────┐      ┌───────────────┐  │
│  │   Readable   │      │   Writable    │      │    Duplex     │  │
│  │              │      │               │      │               │  │
│  │ 数据源 → 消费 │      │  消费 → 数据汇 │      │  可读 + 可写   │  │
│  │               │      │               │      │               │  │
│  │ push 模式     │      │  write()      │      │  两套独立 buffer│  │
│  │ pull 模式     │      │  drain 事件   │      │               │  │
│  └───────────────┘      └───────────────┘      └───────┬───────┘  │
│                                                          │          │
│                                                          │          │
│                                                    ┌─────▼───────┐  │
│                                                    │  Transform  │  │
│                                                    │             │  │
│                                                    │ 输入 ↔ 输出  │  │
│                                                    │ (因果关联)   │  │
│                                                    └─────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1. Readable Stream（可读流）

**两种模式**：

| 模式 | 触发方式 | 特点 |
|------|----------|------|
| **flowing** | 添加 `data` 事件监听或 `pipe()` | 数据自动流动，类似事件发射 |
| **paused** | 仅 `read()` 调用 | 显式拉取，需要手动 `read(n)` |

```javascript
const { Readable } = require('stream');

// 场景 1：已有的数据源 → Readable
const readable = Readable.from(['a', 'b', 'c']);

// 场景 2：自定义数据源
class Counter extends Readable {
  constructor(max) {
    super();
    this.max = max;
    this.counter = 0;
  }
  
  _read() {
    if (this.counter++ < this.max) {
      this.push(String(this.counter));
    } else {
      this.push(null); // 结束流
    }
  }
}

// 消费方式 1：data 事件（flowing 模式）
readable.on('data', (chunk) => {
  console.log('data:', chunk.toString());
});

// 消费方式 2： pipe()（自动背压）
readable.pipe(writable);

// 消费方式 3：异步迭代器（Node 10+）
for await (const chunk of readable) {
  console.log('chunk:', chunk);
}
```

### 2. Writable Stream（可写流）

```javascript
const { Writable } = require('stream');

// 基本使用
const fs = require('fs');
const writable = fs.createWriteStream('output.txt');

writable.write('chunk1\n');
writable.write('chunk2\n');
writable.end('final chunk'); // 必须调用 end()

// drain 事件（背压处理）
const writable = fs.createWriteStream('big-file.txt');
const readable = getLargeReadable(); // 假设是大量数据源

readable.on('data', (chunk) => {
  const canContinue = writable.write(chunk);
  if (!canContinue) {
    readable.pause(); // 暂停Readable
    writable.once('drain', () => {
      readable.resume(); // 恢复Readable
    });
  }
});
```

### 3. Duplex Stream（双工流）

**可同时读写，适用于网络场景**：

```javascript
const { Duplex } = require('stream');

class SocketDuplex extends Duplex {
  constructor(netSocket) {
    super();
    this.socket = netSocket;
    
    // 从 socket 读 → 流向 Duplex 的可读端
    netSocket.on('data', (chunk) => {
      this.push(chunk);
    });
    
    // 从 Duplex 的可写端写 → 流向 socket
    netSocket.on('end', () => {
      this.push(null);
    });
  }
  
  _read(n) {
    // 从底层 source 读取（上面已经通过 push 喂数据了）
  }
  
  _write(chunk, encoding, callback) {
    this.socket.write(chunk, encoding, callback);
  }
}
```

### 4. Transform Stream（转换流）

**输入经过变换后输出，是 Duplex 的特例**：

```javascript
const { Transform } = require('stream');

// 示例：JSON 解析 Transform
class JSONParse extends Transform {
  constructor(options) {
    super({ readableObjectMode: true, ...options });
    this.buffer = '';
  }
  
  _transform(chunk, encoding, callback) {
    this.buffer += chunk.toString();
    
    // 尝试解析完整 JSON（每行一个 JSON）
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop(); // 保留不完整的行
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          this.push(JSON.parse(line));
        } catch (e) {
          this.emit('error', e);
        }
      }
    }
    callback();
  }
  
  _flush(callback) {
    if (this.buffer) {
      try {
        this.push(JSON.parse(this.buffer));
      } catch (e) {
        this.emit('error', e);
      }
    }
    callback();
  }
}

// 使用
fs.createReadStream('data.jsonl')
  .pipe(new JSONParse())
  .pipe(process.stdout);
```

---

## 优劣势分析

### ✅ 优势

| 优势 | 说明 |
|------|------|
| **内存固定** | 处理 GB 级数据，内存占用 O(chunk_size)，不 O(data_size) |
| **时间短** | 边读边处理，总时间 < 读全部 + 处理全部 |
| **组合性** | pipe() 组合任意流 |
| **背压** | 内置背压机制，自动暂停/恢复 |
| **UNIX 哲学** | 符合"小工具组合大功能"的设计思想 |

### ❌ 劣势

| 劣势 | 说明 |
|------|------|
| **调试困难** | pipe() 链长时，错误栈不直观 |
| **错误处理** | pipe 链中一个流出错，整个链需要正确清理 |
| **状态管理** | Transform 流有时需要维护内部状态 |
| **不适合小数据** | 对于小数据，简单的 `fs.readFile` 更直接 |

---

## 适用场景

| 场景 | 推荐方案 |
|------|----------|
| 大文件复制/处理 | `createReadStream → pipe → createWriteStream` |
| HTTP 请求/响应 | 天然 Duplex |
| 文件压缩/解压 | Transform |
| JSON Lines 处理 | Transform |
| WebSocket | Duplex |
| 标准输入/输出 | stdin/stdout 是 Readable/Writable |
| 数据库大结果集 | Query Stream |

| 场景 | 不推荐 Stream |
|------|---------------|
| 小文件 (< 1MB) | 直接 readFile/writeFile 更简单 |
| 需要随机访问 | Stream 是顺序的 |
| 多源合并 | 需要 stream-combiner 等复杂模式 |

---

## 代码演示

### pipe 链与错误处理

```javascript
const { pipeline } = require('stream/promises');
const { createReadStream, createWriteStream } = require('fs');
const { gzip } = require('zlib');

// ❌ 旧方式：pipe 错误处理麻烦
readable
  .pipe(gzip())
  .on('error', (e) => { /* 只有 gzip 的错误 */ })
  .pipe(writable)
  .on('error', (e) => { /* 只有 writable 的错误 */ });

// ✅ 新方式：pipeline 自动处理所有错误和清理
async function process() {
  try {
    await pipeline(
      createReadStream('input.txt'),
      gzip(),
      createWriteStream('output.gz')
    );
    console.log('Pipeline succeeded');
  } catch (err) {
    console.error('Pipeline failed:', err);
    // pipeline 会自动 destroy 所有流
  }
}
```

### 对象模式

```javascript
// 默认流处理的是 Buffer/String
// 对象模式处理 JavaScript 对象

const { Readable, Writable } = require('stream');

const objectReadable = Readable.from([
  { type: 'user', data: { name: 'Alice' } },
  { type: 'user', data: { name: 'Bob' } },
], { objectMode: true });

const objectWritable = new Writable({
  objectMode: true,
  write(chunk, encoding, callback) {
    console.log('Received:', chunk);
    callback();
  }
});

objectReadable.pipe(objectWritable);
```

---

## 常见误区

| 误区 | 正确理解 |
|------|----------|
| ❌ pipe() 自动处理所有错误 | ✅ 旧 pipe() 不会自动 destroy，需要用 pipeline() |
| ❌ Stream 都是 flowing 模式 | ✅ 初始是 paused 模式，加 data 监听或 pipe 才变 flowing |
| ❌ Transform 输入输出类型相同 | ✅ Transform 可以有不同的 readable/writable objectMode |
| ❌ drain 事件表示写入完成 | ✅ drain 表示 write buffer 清空，可以继续写 |

---

## 延伸阅读

### 官方文档
- [Stream 官方文档](https://nodejs.org/api/stream.html)
- [Stream 高级用法](https://nodejs.org/api/stream.html#api-for-stream-implementers)

### 源码位置
- `lib/_stream_readable.js` — Readable 实现
- `lib/_stream_writable.js` — Writable 实现
- `lib/_stream_transform.js` — Transform 实现
- `lib/internal/streams/pipeline.js` — pipeline 实现

### 经典博客
- [Stream Handbook](https://github.com/substack/stream-handbook)
- [Node.js Streams: The Definitive Guide](https://nodesource.com/blog/understanding-streams-in-nodejs/)

---

## 相关节点

- [ backpressure-mechanism ](backpressure-mechanism.md) — 背压机制详解
- [ pipeline-vs-pipe ](pipeline-vs-pipe.md) — pipeline vs pipe 对比
- [ stream-error-handling ](stream-error-handling.md) — 流错误处理
