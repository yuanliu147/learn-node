# Node.js 中的 IPC 和序列化

**进程间通信（IPC）** 对于 Node.js 应用来说是基础——使得 cluster 模块中的主进程和工作进程之间、子进程以及 Worker 线程之间能够通信。理解 IPC 机制和序列化格式对于构建高性能分布式系统至关重要。

## IPC 机制概述

```
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js 中的 IPC 机制                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   管道      │    │   套接字    │    │   消息      │        │
│   │             │    │             │    │   通道      │        │
│   ├─────────────┤    ├─────────────┤    ├─────────────┤        │
│   │ - 匿名      │    │ - TCP       │    │ - Worker   │        │
│   │ - 命名      │    │ - UNIX      │    │   线程     │        │
│   │ - IPC 管道  │    │ - UDP       │    │ - 共享     │        │
│   │             │    │             │    │   内存     │        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
│   使用方：                      使用方：                       │
│   - child_process               - cluster 模块              │
│   - cluster 模块               - Worker 类                │
│   - stdio 转发                 - MessageChannel               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 匿名管道（stdin/stdout/stderr）

### 基本管道用法

```javascript
const { spawn } = require('child_process');

// 创建带有管道 stdin/stdout/stderr 的子进程
const child = spawn('wc', ['-l'], {
    stdio: ['pipe', 'pipe', 'pipe']
});

// 写入到子进程的 stdin
child.stdin.write('第一行\n');
child.stdin.write('第二行\n');
child.stdin.write('第三行\n');
child.stdin.end();  // 关闭 stdin

// 读取子进程的 stdout
child.stdout.on('data', (data) => {
    console.log(`输出: ${data}`);
});

// 读取子进程的 stderr
child.stderr.on('data', (data) => {
    console.error(`错误: ${data}`);
});

child.on('close', (code) => {
    console.log(`子进程退出，代码 ${code}`);
});
```

### 连接到父进程的 stdio

```javascript
// 继承父进程的 stdio - 子进程使用相同的终端
const child = spawn('ls', ['-la'], {
    stdio: 'inherit'  // 三个流都被继承
});

// 或继承特定的流
const child2 = spawn('node', ['worker.js'], {
    stdio: ['ignore', 'pipe', 'pipe']
    // 0: ignore (stdin)
    // 1: pipe (stdout) 
    // 2: pipe (stderr)
});
```

## 命名管道（FIFO）

### 创建和使用命名管道

```bash
# 创建命名管道
mkfifo /tmp/my-pipe

# 写入管道（在一个终端中）
echo "hello" > /tmp/my-pipe

# 从管道读取（在另一个终端中）
cat /tmp/my-pipe
```

```javascript
// writer.js - 写入命名管道
const fs = require('fs');

const pipePath = '/tmp/my-pipe';

// 打开管道进行写入（阻塞直到读取器打开）
const pipe = fs.openSync(pipePath, 'w');

// 写入数据
fs.writeSync(pipe, '通过管道发送的消息\n');
fs.writeSync(pipe, '另一条消息\n');

// reader.js - 从命名管道读取
const fs = require('fs');

const pipePath = '/tmp/my-pipe';

// 打开管道进行读取（阻塞直到写入器打开）
const pipe = fs.openSync(pipePath, 'r');

let data;
while ((data = fs.readFileSync(pipe, 1024)) && data.length > 0) {
    console.log('收到:', data.toString());
}
```

### 使用 child_process 的 IPC 通道

```javascript
// parent.js
const { fork } = require('child_process');

const child = fork('./child.js');

// 通过 IPC 通道发送消息
child.send({ type: 'command', action: 'start' });
child.send({ type: 'config', port: 3000 });

// 接收来自子进程的消息
child.on('message', (msg) => {
    console.log('来自子进程:', msg);
});

child.on('exit', (code) => {
    console.log(`子进程退出，代码 ${code}`);
});

// child.js
process.on('message', (msg) => {
    console.log('来自父进程:', msg);
    
    // 响应父进程
    process.send({ type: 'status', ready: true });
});

// 让父进程知道我们已经就绪
process.send({ type: 'ready' });
```

## 序列化格式

### JSON 序列化（默认）

```javascript
// 简单 JSON - 适用于所有 Node.js 版本
const data = { 
    type: 'user:created',
    payload: {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        created: new Date().toISOString()
    }
};

// 序列化
const serialized = JSON.stringify(data);
// '{"type":"user:created","payload":{"id":1,"name":"John",...}}'

// 反序列化
const parsed = JSON.parse(serialized);

// 局限性：
// - 重复字段名开销大
// - 不支持二进制数据
// - 无类型安全
// - 大数据集速度慢
```

### MessagePack（二进制序列化）

```javascript
// msgpack-lite - 高效的二进制格式
const msgpack = require('msgpack-lite');

const data = {
    type: 'user:created',
    payload: {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        created: new Date().toISOString()
    }
};

// 编码为二进制
const encoded = msgpack.encode(data);
// <Buffer 82 a4 74 79 70 65 ...>  (比 JSON 小得多)

// 从二进制解码
const decoded = msgpack.decode(encoded);

// 优点：
// - 二进制格式 - 更小的大小
// - 更快的编码/解码
// - 保留类型信息
```

### Protocol Buffers

```javascript
// protobufjs - Google 的二进制格式
const protobuf = require('protobufjs');

// 定义 schema
const schema = `
syntax = "proto3";

message UserEvent {
    string type = 1;
    UserPayload payload = 2;
}

message UserPayload {
    uint32 id = 1;
    string name = 2;
    string email = 3;
    string created_at = 4;
}
`;

const root = protobuf.parse(schema).root;
const UserEvent = root.lookupType('UserEvent');

const event = UserEvent.create({
    type: 'user:created',
    payload: {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        created_at: new Date().toISOString()
    }
});

// 编码
const encoded = UserEvent.encode(event).finish();
// 非常紧凑的二进制表示

// 解码
const decoded = UserEvent.decode(encoded);
```

### 序列化方法比较

| 格式 | 大小 | 速度 | Schema | 二进制支持 |
|------|------|------|--------|-------------|
| JSON | 大 | 中等 | 否 | 否 |
| MessagePack | 中等 | 快 | 否 | 是 |
| Protocol Buffers | 很小 | 很快 | 是 | 是 |
| Thrift | 小 | 快 | 是 | 是 |

## Cluster 模块中的 IPC

### 主进程和工作进程之间的消息传递

```javascript
const cluster = require('cluster');

if (cluster.isPrimary) {
    const worker = cluster.fork();
    
    // 发送消息到工作进程
    worker.send({
        type: 'task',
        data: { jobId: 123, priority: 'high' }
    });
    
    // 接收来自工作进程的消息
    worker.on('message', (msg) => {
        if (msg.type === 'task:complete') {
            console.log(`任务 ${msg.data.jobId} 完成`);
        }
    });
    
} else {
    // 工作进程
    const http = require('http');
    
    // 接收来自主进程的消息
    process.on('message', (msg) => {
        if (msg.type === 'task') {
            const result = processTask(msg.data);
            
            // 发送结果回主进程
            process.send({
                type: 'task:complete',
                data: { jobId: msg.data.jobId, result }
            });
        }
    });
    
    process.send({ type: 'ready' });
}
```

### 广播到所有工作进程

```javascript
const cluster = require('cluster');

if (cluster.isPrimary) {
    const numCPUs = require('os').cpus().length;
    
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    // 广播消息到所有工作进程
    function broadcast(msg) {
        for (const id in cluster.workers) {
            cluster.workers[id].send(msg);
        }
    }
    
    // 示例：通知所有工作进程关闭
    process.on('SIGTERM', () => {
        broadcast({ type: 'shutdown', timeout: 30000 });
    });
    
} else {
    process.on('message', (msg) => {
        if (msg.type === 'shutdown') {
            console.log(`工作进程 ${process.pid} 将在 ${msg.timeout}ms 后关闭`);
            setTimeout(() => {
                process.exit(0);
            }, msg.timeout);
        }
    });
}
```

## MessageChannel（Worker 线程）

```javascript
const { Worker, MessageChannel } = require('worker_threads');

// 创建消息通道
const channel = new MessageChannel();

// 获取两个端口（通道的两端）
const port1 = channel.port1;
const port2 = channel.port2;

// 设置消息处理器
port1.on('message', (msg) => {
    console.log('端口 1 收到:', msg);
});

port2.on('message', (msg) => {
    console.log('端口 2 收到:', msg);
});

// 开始接收
port1.start();
port2.start();

// 发送消息
port1.postMessage({ from: 'port1', data: 'hello' });
port2.postMessage({ from: 'port2', data: 'world' });

// 完成后关闭
port1.close();
port2.close();
```

## SharedArrayBuffer（零拷贝 IPC）

```javascript
// 使用共享内存的工作进程
const { Worker } = require('worker_threads');
const assert = require('assert');

// 创建共享缓冲区（64 字节）
const sharedBuffer = new SharedArrayBuffer(64);
const sharedArray = new Int32Array(sharedBuffer);

// 创建带有共享缓冲区的工作进程
const worker = new Worker('./worker.js', {
    workerData: { sharedBuffer }
});

// 在 worker.js 中：
const { workerData, parentPort } = require('worker_threads');

const sharedArray = new Int32Array(workerData.sharedBuffer);

// 使用 Atomics 进行同步
Atomics.add(sharedArray, 0, 1);  // 递增计数器
const value = Atomics.load(sharedArray, 0);

// 通知父进程
parentPort.postMessage({ type: 'shared', counter: value });
```

## 性能考虑

### 序列化开销

```javascript
// 序列化方法基准测试
const Benchmark = require('benchmark');
const msgpack = require('msgpack-lite');

const largeData = {
    users: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `用户 ${i}`,
        email: `user${i}@example.com`,
        active: true,
        score: Math.random() * 100
    }))
};

const suite = new Benchmark.Suite();

suite.add('JSON.stringify', () => {
    const serialized = JSON.stringify(largeData);
    const parsed = JSON.parse(serialized);
});

suite.add('msgpack.encode', () => {
    const encoded = msgpack.encode(largeData);
    const decoded = msgpack.decode(encoded);
});

suite.on('cycle', (event) => {
    console.log(event.target.toString());
});
```

### 批量消息

```javascript
// ❌ 差：单个消息 - 高开销
for (const item of largeArray) {
    worker.postMessage({ type: 'item', data: item });
}

// ✅ 好：批量消息 - 低开销
const BATCH_SIZE = 100;
const batches = [];

for (let i = 0; i < largeArray.length; i += BATCH_SIZE) {
    batches.push(largeArray.slice(i, i + BATCH_SIZE));
}

for (const batch of batches) {
    worker.postMessage({ type: 'batch', data: batch });
}
```

### 使用 Transferables 实现零拷贝

```javascript
// 转移所有权（零拷贝）
const buffer = new ArrayBuffer(1024 * 1024);  // 1MB

worker.postMessage({ 
    type: 'data', 
    buffer: buffer 
}, [buffer]);  // 转移缓冲区

// 转移后，在此上下文中缓冲区被分离
// buffer.byteLength === 0

// 克隆（复制数据）
const data = { big: new Uint8Array(1024 * 1024) };
worker.postMessage({ type: 'data', data });  // 数据被克隆
```
