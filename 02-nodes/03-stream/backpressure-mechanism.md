# Node.js Stream 中的背压机制

> **架构视角**：背压是生产者和消费者之间的**流量控制契约**。它通过使慢消费者对快生产者可见来防止级联故障，将隐式问题转换为可处理的显式信号。

## 核心问题：生产者-消费者速度不匹配

```
┌─────────────┐    speed A     ┌─────────────┐    speed B     ┌─────────────┐
│   Source    │ ──────────────▶│  Transform  │ ──────────────▶│ Destination │
│  (producer) │   data chunks   │   (stage)   │   data chunks   │ (consumer)  │
└─────────────┘                └─────────────┘                └─────────────┘
       A >> B  →  buffer accumulation  →  memory growth  →  OOM or crash
```

当 `speed(producer) >> speed(consumer)` 时：
- 内存无限增长（缓冲区累积）
- GC 压力增加
- 延迟飙升
- 最终：服务降级或崩溃

**背压机制使这种不匹配变得显式且可存活。**

## 架构契约

每个 Writable 流通过 `write()` 暴露一个二元契约：

```javascript
const canContinue = writable.write(chunk);
// true  → 生产者可以继续（缓冲区有容量）
// false → 生产者必须暂停（背压信号）
```

这是一个**流量控制协议**，而不仅仅是优化。

### highWaterMark：缓冲区容量预算

| Stream 类型      | 默认 `highWaterMark` | 原因 |
|------------------|--------------------------|------|
| Readable         | 16KB                     | 平衡内存与吞吐量 |
| Writable         | 16KB                     | 相同 |
| File (fs)        | 64KB                     | 磁盘 I/O 较慢；更大的缓冲区分摊系统调用开销 |
| objectMode       | 16 (计数，非字节)          | 对象更重 |

```javascript
// 高吞吐量场景调优
const stream = createReadStream(file, { highWaterMark: 128 * 1024 });
// 更大的缓冲区 → 更少的 `write()` 调用 → 更低的 CPU 开销
// 代价：每个流占用更多内存
```

**权衡**：`highWaterMark` 是内存-吞吐量调节旋钮。更高 = 更好的吞吐量，慢消费者时更差的内存峰值。

## Drain 周期：显式流量控制状态机

```
       readable.on('data')
              │
              ▼
    ┌──────────────────┐
    │ writable.write() │ ──── returns true ────▶ readable continues (no change)
    └────────┬─────────┘
             │ returns false
             ▼
    ┌──────────────────┐
    │  readable.pause() │     ◄─── System enters BACKPRESSURE state
    └────────┬─────────┘              Memory usage stabilizes
             │
             ▼ writable.buffer full
    ┌──────────────────┐
    │  (buffer drains) │
    └────────┬─────────┘
             │ buffer fully drained
             ▼
    ┌──────────────────┐
    │   'drain' event   │     ◄─── Backpressure released
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ readable.resume() │ ──▶ System returns to normal flow
    └──────────────────┘
```

**关键不变量**：在 `pause()` 和 `drain` 之间，不会读取新数据。内存被限制在 `highWaterMark`。

## 实现：手动 vs 自动

### 手动实现（显式契约）

```javascript
const readable = getReadableSource();
const writable = getWritableDest();

readable.on('data', (chunk) => {
  const canContinue = writable.write(chunk);

  if (!canContinue) {
    readable.pause();                    // 停止读取
    writable.once('drain', () => {
      readable.resume();                // 仅在 drain 后恢复
    });
  }
});
```

**架构决策**：手动处理让你控制暂停/恢复逻辑。当需要自定义缓冲、指标或写入前的逐块处理时使用。

### pipe() — 自动背压

```javascript
readable.pipe(writable);
```

`pipe()` **在内部封装了 drain 周期**。对于简单的点对点流，它是声明式的、正确的默认选择。

**使用场景**：单个 read→write 对，且错误处理在外部管理。

## Transform 链：背压传播

```
readable ──▶ transform1 ──▶ transform2 ──▶ writable
                │               │
            highWaterMark   highWaterMark
```

背压通过链**向上游**传播：

1. `writable` 从 `write()` 返回 `false`
2. `transform2` 收到 `false` → 其 readable 端暂停
3. `transform1` 收到背压 → 其 readable 端暂停
4. `readable` 暂停

**没有数据丢失。链自我调节。**

```javascript
// 使用 pipe() - 背压自动传播
readable
  .pipe(transform1)
  .pipe(transform2)
  .pipe(writable);

// 使用 pipeline() - 相同的背压行为，加上正确的错误处理
const { pipeline } = require('stream');
pipeline(
  readable,
  transform1,
  transform2,
  writable,
  (err) => { /* cleanup */ }
);
```

## 架构模式

### 模式 1：生产者-消费者解耦

背压实现了快生产者和慢消费者之间的**异步解耦**。

```
Producer ────buffer───▶ Consumer
         backpressure

Without backpressure: coupled synchronous failure
With backpressure: independent failure modes, bounded memory
```

**使用场景**：文件上传 → 磁盘写入，API 响应 → 客户端写入。

### 模式 2：服务网格背压

在系统级别，背压防止级联故障：

```
Incoming requests
       │
       ▼
┌──────────────┐   backpressure signal   ┌──────────────┐
│  Upstream    │ ◀────────────────────── │   Downstream │
│  (producer)  │   "slow down / queue full"  │  (consumer) │
└──────────────┘                         └──────────────┘
```

Node.js streams 在 I/O 层面实现了这个契约 — 相同模式适用于服务边界（TCP pressure, HTTP 429, 连接池耗尽）。

### 模式 3：带溢出处理的有界处理

```javascript
// 架构：缓冲区满时拒绝新工作
// （应用边界处的拥塞控制）
const MAX_BUFFER = 1000;

readable.on('data', (chunk) => {
  if (buffer.length >= MAX_BUFFER) {
    // 向上游发送减速信号
    readable.pause();
    setTimeout(() => checkOverflow(), 100);
  } else {
    buffer.push(chunk);
    writable.write(chunk);
  }
});
```

## 生产环境背压诊断

| 信号 | 含义 |
|------|------|
| `write()` 频繁返回 `false` | 下游是瓶颈 |
| 高吞吐量下内存稳定 | 背压正在工作（有界缓冲区） |
| 内存增长 + `write()` 返回 `false` | 背压未被遵守 |
| `drain` 事件上高 CPU | 大量小写入 → 考虑批处理 |

**监控**：在你的流处理器中检测 `write()` 返回值。

```javascript
let falseCount = 0;
readable.on('data', (chunk) => {
  if (!writable.write(chunk)) {
    falseCount++;
    readable.pause();
    writable.once('drain', () => readable.resume());
  }
});
// 如果 falseCount / totalWrites > threshold 则告警
```

## 决策总结

| 场景 | 方法 |
|------|------|
| 简单文件复制 | `pipe()` |
| Transform 链 | `pipeline()` |
| 自定义缓冲/指标 | 手动 pause/drain |
| 服务间流 | 手动 + 断路器 |
| 对象流 | `objectMode: true` + 对象 highWaterMark |

**规则**：始终遵守 `write()` 的返回值。忽略背压是内存安全问题，而非性能优化。
