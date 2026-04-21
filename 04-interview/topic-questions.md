# Topic Questions - Node.js 核心知识点问答

## 模块系统

### Q1: Node.js 模块加载机制是怎样的？
**难度**: Medium

**参考答案**:
1. 缓存机制：首次 `require()` 后，结果会被缓存
2. 路径解析：
   - 核心模块 (`node:fs`) → 直接加载
   - 相对路径 (`./`, `../`) → 相对于当前文件解析
   - 绝对路径 (`/`) → 从根目录解析
   - 无前缀 → 从 `node_modules` 向上搜索
3. 加载顺序：缓存 → 核心模块 → 文件模块 → 第三方模块
4. Module Wrapper：每个模块被包装在 `(function(exports, require, module, __filename, __dirname) {...})` 中

### Q2: exports 和 module.exports 的区别？
**难度**: Easy

**参考答案**:
- `exports` 是 `module.exports` 的引用
- 只能使用 `exports.xxx` 形式添加属性
- 直接赋值 `exports = {}` 会断开引用，不起作用
- 若要导出单个对象，使用 `module.exports`

---

## 事件循环与异步

### Q3: 描述 Node.js 事件循环的执行顺序
**难度**: Hard

**参考答案**:
```
┌─────────────────────────┐
│   Microtasks (Promise)  │  ← process.nextTick > Promise.then
├─────────────────────────┤
│   Timers                │  ← setTimeout, setInterval
├─────────────────────────┤
│   Pending Callbacks     │  ← I/O callbacks
├─────────────────────────┤
│   Idle, Prepare         │  ← internal
├─────────────────────────┤
│   Poll                  │  ← retrieve new I/O events
├─────────────────────────┤
│   Check                 │  ← setImmediate
├─────────────────────────┤
│   Close Callbacks       │  ← socket.on('close')
└─────────────────────────┘
```

### Q4: setTimeout vs setImmediate vs process.nextTick
**难度**: Medium

**参考答案**:
| API | 执行时机 | 所属阶段 |
|-----|---------|---------|
| `process.nextTick` | 任意阶段结束后 | Microtasks |
| `setImmediate` | Poll 完成后 | Check |
| `setTimeout` | 到达定时器阈值 | Timers |

**注意**: I/O 循环中，`setImmediate` 先于 `setTimeout` 执行

### Q5: Promise vs Callback 的区别
**难度**: Easy

**参考答案**:
- Promise 优势：链式调用、错误处理更规范、避免回调地狱
- Callback 优势：直观、简单场景更简洁
- Node.js 惯例：Error-first callback (err, data) => {}

---

## 事件发射器 (EventEmitter)

### Q6: 实现一个简易的 EventEmitter
**难度**: Medium

**参考答案**:
```javascript
class EventEmitter {
  constructor() {
    this.events = {};
  }
  
  on(event, listener) {
    (this.events[event] || (this.events[event] = [])).push(listener);
    return this;
  }
  
  emit(event, ...args) {
    const listeners = this.events[event] || [];
    listeners.forEach(fn => fn(...args));
    return this;
  }
  
  off(event, listener) {
    const listeners = this.events[event] || [];
    const idx = listeners.indexOf(listener);
    if (idx > -1) listeners.splice(idx, 1);
    return this;
  }
}
```

---

## Stream 流

### Q7: Node.js 中 Stream 的类型有哪些？
**难度**: Medium

**参考答案**:
- Readable: 可读数据源 (fs.createReadStream, HTTP response)
- Writable: 可写目标 (fs.createWriteStream, HTTP request)
- Duplex: 同时可读可写 (net.Socket)
- Transform: 转换数据 (zlib.createGzip, crypto)

### Q8: backpressure 是什么？如何处理？
**难度**: Hard

**参考答案**:
- 定义：Writable 处理速度慢于 Readable 产生速度
- 表现：`write()` 返回 `false`，应停止写入
- 解决：监听 `drain` 事件后再继续写入
- 高层方案：使用 `pipe()` 自动处理，或 pipeline() API

---

## 内存管理与垃圾回收

### Q9: V8 垃圾回收算法有哪些？
**难度**: Medium

**参考答案**:
- Scavenge (Young generation): 快速复制，适合新对象
- Mark-Sweep (Old generation): 标记清除，回收死亡对象
- Mark-Compact: 标记整理，消除内存碎片
- 增量标记 + 懒清理：减少 GC 暂停时间

### Q10: 什么是内存泄漏？常见原因有哪些？
**难度**: Medium

**参考答案**:
**常见原因**:
1. 全局变量未清理
2. 闭包引用外部变量
3. 事件监听器未移除
4. 缓存未设置上限
5. 定时器未清除

**排查工具**: `--inspect`, Chrome DevTools, heapdump

---

## Buffer 与二进制

### Q11: Buffer 和 String 的区别？
**难度**: Easy

**参考答案**:
- Buffer: 固定长度字节序列，二进制数据
- String: UTF-8 编码的 JavaScript 字符串
- 转换: `Buffer.from(str)` / `buf.toString()`

### Q12: 如何正确处理中文编码？
**难度**: Medium

**参考答案**:
```javascript
// 正确处理中文字符
const str = '你好世界';
const buf = Buffer.from(str, 'utf8');
console.log(buf.length); // 15 (每个汉字3字节)

// 读取时指定编码
const fs = require('fs');
const content = fs.readFileSync('file.txt', 'utf8');
```

---

## 网络与 HTTP

### Q13: HTTP/1.1 vs HTTP/2 的区别
**难度**: Medium

**参考答案**:
| 特性 | HTTP/1.1 | HTTP/2 |
|-----|---------|--------|
| 多路复用 | 需 pipelining | 单一 TCP 多流 |
| Header 压缩 | 无 | HPACK |
| Server Push | 无 | 有 |
| 流量控制 | 无 | 流级别 |

### Q14: TCP vs UDP
**难度**: Easy

**参考答案**:
- TCP: 面向连接、可靠、有序、流量控制、拥塞控制
- UDP: 无连接、不可靠、不保证顺序、更低延迟
- 选择：TCP 适合文件/数据可靠传输，UDP 适合实时音视频

---

## 进程与线程

### Q15: Cluster 模块的工作原理
**难度**: Hard

**参考答案**:
- Master 进程：创建 IPC 通道，分发请求
- Worker 进程：独立事件循环，处理请求
- 负载均衡：默认 round-robin (Node.js 0.12+)
- 通信：通过 `process.send()` / `on('message')`

### Q16: Worker Threads vs Child Processes
**难度**: Medium

**参考答案**:
| 特性 | Worker Threads | Child Processes |
|-----|---------------|-----------------|
| 内存 | 共享堆 | 独立内存 |
| 通信 | SharedArrayBuffer / MessageChannel | IPC |
| 适用 | CPU 密集型计算 | 进程隔离 |
| 风险 | 线程安全问题 | 更高开销 |

---

## 错误处理

### Q17: 异步错误处理的最佳实践
**难度**: Medium

**参考答案**:
```javascript
// 1. Promise 链式
fetchData()
  .then(process)
  .catch(handleError);

// 2. async/await
try {
  const data = await fetchData();
  await process(data);
} catch (err) {
  handleError(err);
}

// 3. Express 错误中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});
```

---

## Express / Koa

### Q18: Express 中间件的执行顺序
**难度**: Medium

**参考答案**:
1. 全局中间件按注册顺序执行
2. 路由中间件只匹配该路由
3. 错误处理中间件必须有 4 个参数 `(err, req, res, next)`
4. `next()` 传递控制权，跳到下一个中间件

### Q19: 如何实现请求限流？
**难度**: Hard

**参考答案**:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 100 请求
  message: 'Too many requests'
});

app.use('/api/', limiter);
```

---

## 数据库

### Q20: MongoDB vs MySQL 的选择
**难度**: Easy

**参考答案**:
- MongoDB: 文档存储、灵活 Schema、JSON 友好、水平扩展
- MySQL: 关系型、事务支持 (ACID)、JOIN 强大、结构化数据
- 选择依据：数据结构复杂度、事务需求、规模

---

## 安全

### Q21: XSS 和 CSRF 防护
**难度**: Medium

**参考答案**:
- XSS: 转义用户输入、Content-Type: application/json、 CSP
- CSRF: CSRF Token、SameSite Cookie、验证 Origin

### Q22: 如何安全存储密码？
**难度**: Easy

**参考答案**:
- 禁止明文存储
- 使用 bcrypt/scrypt/argon2 加盐哈希
- 不要使用 MD5/SHA1
```javascript
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash(password, 10);
const match = await bcrypt.compare(password, hash);
```

---

## 性能优化

### Q23: 如何排查 Node.js 性能问题？
**难度**: Hard

**参考答案**:
1. 定位：火焰图 (clinic flame), `--prof`
2. 分析：`--inspect`, Chrome DevTools
3. 常见瓶颈：
   - CPU 密集 (加密/压缩/正则)
   - 内存泄漏
   - I/O 阻塞
   - 数据库慢查询
4. 工具：autocannon (压测), 0x (火焰图)

### Q24: 什么是 CPU Profiling？
**难度**: Medium

**参考答案**:
- 记录函数调用栈和执行时间
- 生成火焰图可视化
- 使用 `--inspect` + Chrome DevTools
- 或 `0x` / `clinic` 工具自动分析
