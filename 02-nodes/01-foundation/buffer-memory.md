---
title: "Node.js 中的 Buffer 与内存管理"
description: "全面指南：如何在 Node.js 中使用 Buffer、原始二进制数据和内存管理"
tags:
  - Node.js
  - Buffer
  - Memory
  - Binary data
  - Streams
  - TypedArrays
topics:
  - nodejs-core
  - memory-management
level: "intermediate"
updated: "2025-01-15"
---

# Node.js 中的 Buffer 与内存管理

## 概述

Node.js 专为 I/O 密集型应用设计，这些应用经常需要处理原始二进制数据。`Buffer` 类使 Node.js 开发者能够在 V8 JavaScript 引擎堆之外直接操作内存中的二进制数据。理解 Buffer 对于处理文件、网络、协议以及任何涉及原始字节的场景至关重要。

## 什么是 Buffer？

`Buffer` 是 V8 堆之外分配的原始内存，类似于整数数组但表示原始字节。Buffer 是在 JavaScript 存在 TypedArrays 之前专门为 Node.js 处理二进制数据而设计的。

### 为什么 Buffer 存在于 V8 堆之外

- **I/O 性能**：文件和网络操作的直接内存访问
- **二进制协议支持**：处理 TCP、HTTP、WebSocket 等协议的必要条件
- **大数据处理**：高效处理大量数据，不给 V8 带来 GC 压力
- **无字符串转换开销**：直接字节操作，无需编码/解码

## 创建 Buffer

### Buffer.from()

```javascript
// 从字符串创建（带编码）
const buf1 = Buffer.from('Hello', 'utf8');
const buf2 = Buffer.from('48656c6c6f', 'hex');

// 从数组创建
const buf3 = Buffer.from([72, 101, 108, 108, 111]);

// 从另一个 buffer 创建
const buf4 = Buffer.from(buf1);

// 从 ArrayBuffer 创建
const arrayBuffer = new ArrayBuffer(8);
const buf5 = Buffer.from(arrayBuffer);

// 从 Uint8Array 创建
const uint8 = new Uint8Array([72, 101, 108, 108, 111]);
const buf6 = Buffer.from(uint8);
```

### Buffer.alloc() 和 Buffer.allocUnsafe()

```javascript
// 零初始化的 buffer（安全，稍慢）
const safeBuffer = Buffer.alloc(10);

// 未初始化的 buffer（更快，包含任意数据）
const unsafeBuffer = Buffer.allocUnsafe(10);

// 带特定编码的未初始化 buffer
const sizedBuffer = Buffer.allocUnsafeSlow(10);
```

> **警告**：`Buffer.allocUnsafe()` 和 `Buffer.allocUnsafeSlow()` 更快，但可能包含先前内存使用的敏感数据。当涉及安全时，始终使用 `Buffer.alloc()`。

### Buffer.from() vs Buffer.alloc()

| 方法 | 使用场景 | 初始化 |
|------|----------|--------|
| `Buffer.from()` | 从现有数据创建 buffer | 复制数据 |
| `Buffer.alloc()` | 预分配已知大小 | 零初始化 |
| `Buffer.allocUnsafe()` | 性能关键，立即覆盖 | 未初始化 |

## 使用 Buffer

### 从 Buffer 读取

```javascript
const buf = Buffer.from('Hello World');

// 通过索引访问
console.log(buf[0]); // 72 ('H' 的 ASCII)

// 读取为字符串
console.log(buf.toString('utf8')); // 'Hello World'
console.log(buf.toString('hex'));  // '48656c6c6f20576f726c64'
console.log(buf.toString('base64')); // 'SGVsbG8gV29ybGQ='

// 切片
const partial = buf.slice(0, 5);
console.log(partial.toString()); // 'Hello'
```

### 写入 Buffer

```javascript
const buf = Buffer.alloc(11);

// 写入字符串
buf.write('Hello');
buf.write(' World', 5);

// 在特定偏移量写入
buf.write('Hi', 0, 2);

// 写入特定字节值
buf[0] = 72; // 'H'
buf[1] = 105; // 'i'
```

### Buffer 操作

```javascript
const buf1 = Buffer.from('Hello');
const buf2 = Buffer.from('World');

// 连接 buffer
const combined = Buffer.concat([buf1, buf2]);
console.log(combined.toString()); // 'HelloWorld'

// 比较 buffer
console.log(buf1.compare(buf2)); // -1 (buf1 < buf2)

// 复制 buffer
const copy = Buffer.alloc(5);
buf1.copy(copy);
console.log(copy.toString()); // 'Hello'

// 填充 buffer
const filled = Buffer.alloc(5);
filled.fill('x');
console.log(filled.toString()); // 'xxxxx'
```

## 编码与解码

### 支持的编码

| 编码 | 描述 | 输出示例 |
|------|------|---------|
| `utf8` | UTF-8 Unicode | 非 ASCII 多字节 |
| `utf16le` | UTF-16 小端序 | 每个字符 2-4 字节 |
| `latin1` | ISO-8859-1 | 单字节 |
| `ascii` | 7 位 ASCII | 单字节 |
| `hex` | Base 16 | 每字节两个十六进制数字 |
| `base64` | Base 64 | 每 3 字节 4 个 base64 字符 |
| `base64url` | URL 安全 Base64 | 用 `-_` 代替 `+/` |

### 编码转换

```javascript
// 字符串转 Buffer
const buf = Buffer.from('Hello', 'utf8');

// Buffer 转不同编码
console.log(buf.toString('hex'));    // '48656c6c6f'
console.log(buf.toString('base64'));  // 'SGVsbG8='

// 跨编码转换
const latin = Buffer.from('Héllo', 'latin1');
const utf8 = latin.toString('utf8');
console.log(Buffer.from(utf8, 'utf8').equals(latin)); // false（字符不同）
```

## TypedArrays 与 Buffer 互操作性

Node.js Buffer 与 JavaScript TypedArrays 可互操作：

```javascript
// 从 TypedArray 创建 buffer
const typedArray = new Uint8Array([72, 101, 108, 108, 111]);
const buffer = Buffer.from(typedArray);

// 创建 Buffer，然后作为 TypedArray 查看
const buf = Buffer.from('Hello');
const uint8 = new Uint8Array(buf);
const int16 = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);

// 在 Buffer 和 TypedArray 之间共享内存
const sharedBuffer = Buffer.from(new Uint8Array(10).buffer);
console.log(sharedBuffer.length); // 10（或更多，取决于对齐）
```

### 关键区别

| 特性 | Buffer | TypedArray |
|------|--------|------------|
| V8 堆 | 外部 | 内部 |
| 创建时复制 | 否（共享内存） | 可选 |
| 连接 | `Buffer.concat()` | 手动复制 |
| 编码支持 | 有 | 无 |

## 内存管理

### Buffer 池（快速分配）

Node.js 为小分配维护一个内部 buffer 池：

```javascript
// 对于小 buffer (<= Buffer.poolSize / 2)
// 分配来自共享池
const small = Buffer.alloc(100);

// 对于大 buffer
// 直接在池外分配
const large = Buffer.alloc(10000);
```

### `buffer` 模块工具

```javascript
const buffer = require('buffer');

// 检查 Buffer 池大小（默认：8KB）
console.log(buffer.poolSize);

// 使用池创建 buffer
const pooled = Buffer.allocUnsafe(100);

// 查找 buffer 大小
const buf = Buffer.from('Hello');
console.log(buffer.byteLength(buf)); // 5

// 检查对象是否为 Buffer
console.log(buffer.isBuffer(buf)); // true
console.log(buffer.isBuffer({}));  // false

// 比较 buffer
const b1 = Buffer.from('abc');
const b2 = Buffer.from('abd');
console.log(buffer.compare(b1, b2)); // -1
```

### Buffer 与 GC

由于 Buffer 不受 V8 垃圾回收器管理：
- 它们需要手动内存管理
- 大 buffer 不再需要时应释放
- 将引用设置为 `null` 有助于 GC 回收引用

```javascript
let largeBuffer = Buffer.allocUnsafe(1024 * 1024 * 100); // 100MB

// 完成后，释放以供 GC
largeBuffer = null;
```

## Stream 与 Buffer

Buffer 在 Node.js 流中扮演关键角色：

### Readable Stream

```javascript
const fs = require('fs');
const readable = fs.createReadStream('file.txt');

// data 事件提供 buffer
readable.on('data', (chunk) => {
  console.log('Received chunk:', chunk.length, 'bytes');
  console.log('Chunk type:', typeof chunk, chunk instanceof Buffer);
});
```

### Writable Stream

```javascript
const fs = require('fs');
const writable = fs.createWriteStream('output.txt');

writable.write(Buffer.from('Hello '));
writable.write(Buffer.from('World'));
writable.end();
```

### Stream Buffer 背压

当写入速度快于消费速度时：

```javascript
const fs = require('fs');
const readable = fs.createReadStream('largefile.txt');
const writable = fs.createWriteStream('output.txt');

// 处理背压
readable.on('data', (chunk) => {
  const canContinue = writable.write(chunk);
  if (!canContinue) {
    readable.pause();
    writable.once('drain', () => readable.resume());
  }
});
```

## 处理二进制协议

Buffer 对于二进制协议实现至关重要：

### 读取二进制数据

```javascript
const buf = Buffer.from([0x08, 0x02, 0x9F, 0x00]);

// 读取大端 16 位整数
console.log(buf.readUInt16BE(2)); // 40704

// 写入大端 32 位整数
buf.writeUInt32BE(0xDEADBEEF, 0);
console.log(buf.readUInt32BE(0)); // 3735928495

// 读取浮点数
buf.writeFloatBE(3.14159, 0);
console.log(buf.readFloatBE(0)); // 3.1415899999999
```

### 写入二进制协议

```javascript
// 为协议消息创建 buffer
const headerSize = 8;
const messageSize = 12;
const packet = Buffer.alloc(headerSize + messageSize);

// 写入头部
packet.writeUInt32BE(0xDEADBEEF, 0);  // 魔术数字
packet.writeUInt32BE(messageSize, 4);   // 载荷大小

// 写入载荷
packet.write('Hello', headerSize, messageSize, 'utf8');
```

## 安全考虑

### Buffer 溢出

```javascript
// 不安全：写入超出 buffer 大小
const buf = Buffer.alloc(5);
buf.write('This is too long!'); // 被截断，不会溢出
console.log(buf.toString());    // 'This '

// 始终验证输入大小
function safeWrite(buffer, data) {
  const len = Math.min(data.length, buffer.length);
  buffer.write(data.substring(0, len), 0, len);
  return len;
}
```

### 时序攻击

密钥的常量时间比较：

```javascript
// 容易受到时序攻击
const userProvided = getSecret();
console.log(userProvided === constantSecret); // 时序泄露

// 使用 crypto 进行安全比较
const crypto = require('crypto');
const safe = crypto.timingSafeEqual(
  Buffer.from(userProvided),
  Buffer.from(constantSecret)
);
```

## 性能提示

1. **重用 buffer** 而不是创建新的
2. **安全时使用 `Buffer.alloc()`**，性能关键时使用 `Buffer.allocUnsafe()`
3. **通过 `Buffer.allocUnsafe()`** 池化小分配
4. **避免在热路径中进行字符串转换**
5. **不需要编码支持时使用 TypedArrays**

```javascript
// 不好：在循环中创建 buffer
for (let i = 0; i < 1000; i++) {
  const buf = Buffer.from('some data');
  process(buf);
}

// 好：预分配并重用
const reusable = Buffer.alloc(100);
for (let i = 0; i < 1000; i++) {
  reusable.write('some data');
  process(reusable);
}
```

## 总结

Node.js 中的 Buffer 提供了一种高效处理二进制数据的强大机制。关键要点：

- Buffer 存在于 V8 堆之外以提高性能
- 使用 `Buffer.from()` 从数据创建，使用 `Buffer.alloc()` 预分配
- 安全重要时始终使用 `Buffer.alloc()`
- Buffer 与 TypedArrays 可互操作
- Stream 内部使用 buffer 进行数据处理
- 注意内存管理，尤其是大 buffer
