---
id: event-emitter
title: EventEmitter 事件发射器技术选型
difficulty: L3
tags: ["event-emitter", "observer", "pub-sub", "async", "events"]
prerequisites: ["event-loop-phases"]
related: ["stream-types", "concurrency-patterns"]
interview_hot: true
ai_confidence: 5
version: 2.0
last_updated: 2026-04-21
human_verified: false
todo:
  - 添加自定义事件系统的最佳实践
  - 补充 EventEmitter vs 观察者模式的对比
---

# EventEmitter 事件发射器技术选型

## 一句话定义

> EventEmitter 是 Node.js 的核心事件驱动基础设施，实现了观察者模式 (Observer Pattern)，通过发布/订阅机制解耦事件生产者与消费者，是 Stream、HTTP、FS 等模块的底层实现基础。

---

## 解决什么问题

### 传统回调的问题

```
紧密耦合的回调方式:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  回调地狱:                                                              │
│  fs.readFile('a.json', (err, a) => {                                   │
│    if (err) throw err;                                                  │
│    fs.readFile('b.json', (err, b) => {                                 │
│      if (err) throw err;                                                │
│      fs.readFile('c.json', (err, c) {                                  │
│        // 嵌套越来越深                                                   │
│      });                                                                │
│    });                                                                  │
│  });                                                                    │
│                                                                          │
│  问题:                                                                  │
│  • 错误处理分散且重复                                                    │
│  • 难以添加多个处理器                                                    │
│  • 组件间耦合严重                                                        │
│  • 无法运行时注册/注销                                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

EventEmitter 解耦:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  事件发射器: emit('data', payload)                                      │
│       │                                                                 │
│       ├─────────────┬─────────────┬─────────────┐                      │
│       ▼             ▼             ▼             ▼                      │
│   listener1     listener2     logger      aggregator                  │
│   (处理数据)     (转换数据)    (记录日志)  (聚合结果)                  │
│                                                                          │
│  优点:                                                                  │
│  • 发射器与监听器解耦                                                    │
│  • 可动态添加/移除监听器                                                 │
│  • 一个事件可被多个监听器处理                                            │
│  • 错误处理集中                                                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 架构设计

### 核心实现

```javascript
// EventEmitter 内部结构
class EventEmitter {
  constructor() {
    this._events = {};      // { eventName: [listener1, listener2, ...] }
    this._eventsCount = 0;  // 总监听器数量
    this._maxListeners = 10; // 默认最大监听器数
  }
}
```

### 事件流处理流程

```
emit('event', args) 执行流程:

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  1. 获取事件监听器队列                                                   │
│     └─ this._events.get('event') → [listener1, listener2, ...]        │
│                                                                          │
│  2. 同步遍历所有监听器                                                  │
│     for (listener of listeners) {                                       │
│       listener.call(this, args);                                        │
│     }                                                                    │
│                                                                          │
│  3. 返回是否至少有监听器被调用                                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

特别注意:
• 默认情况下监听器同步执行
• 使用 'error' 事件时，未处理会抛出异常
• 监听器中的异常不会阻止其他监听器执行 (除非 captureRejections)
```

---

## 技术选型视角

### EventEmitter vs 其他模式

| 模式 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **EventEmitter** | 一对多事件通知 | 内置、性能好 | 无优先级、无法中断 |
| **Callbacks** | 一次性结果 | 简单直接 | 难以组合、易嵌套 |
| **Promises** | 单次异步结果 | 链式、可组合 | 无法多值推送 |
| **Async Iterables** | 流式数据 | 背压支持 | 消费单一 |
| **Redux/Flux** | 状态管理 | 可预测、调试友好 | 模板代码多 |

### 何时使用 EventEmitter

```
✅ 适合的场景:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  1. 异步事件通知                                                        │
│     emitter.on('connect', handleConnect);                               │
│                                                                          │
│  2. 一对多通信                                                          │
│     logger.on('log', writeToFile);                                     │
│     logger.on('log', sendToRemote);                                    │
│                                                                          │
│  3. 解耦组件                                                            │
│     emitter.emit('user:login', user);  ← 发送方不关心谁处理            │
│                                                                          │
│  4. 生命周期钩子                                                        │
│     server.on('request', middleware);                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

❌ 不适合的场景:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  1. 需要返回值                                                          │
│     emitter.emit('compute', x);  ← 无法获取返回值                        │
│                                                                          │
│  2. 顺序依赖的处理                                                      │
│     emitter.emit('step1');                                              │
│     emitter.emit('step2');  ← 无法保证 step1 完成再执行 step2           │
│                                                                          │
│  3. 需要取消/中断                                                       │
│     emitter.on('data', heavyComputation);  ← 无法中断                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 性能考虑

```javascript
// 高频事件优化
class OptimizedEmitter extends EventEmitter {
  emit(event, data) {
    const listeners = this._events.get(event);
    if (!listeners || listeners.length === 0) return false;
    
    // 直接调用，避免不必要的检查
    for (let i = 0; i < listeners.length; i++) {
      listeners[i].call(this, data);
    }
    return true;
  }
}

// 避免创建临时对象
// 不好: emitter.emit('data', { x: 1, y: 2, z: 3 });
// 好:   emitter.emit('data', 1, 2, 3);  // 使用展开
```

---

## 实战操作

### 基础用法

```javascript
const { EventEmitter } = require('events');

// 创建事件发射器
class MyEmitter extends EventEmitter {}

const emitter = new MyEmitter();

// 注册监听器
emitter.on('event', function(arg1, arg2) {
  console.log('event fired:', arg1, arg2);
});

// 一次性监听器
emitter.once('single', () => {
  console.log('will only fire once');
});

// 发射事件
emitter.emit('event', 'arg1', 'arg2');  // 触发监听器
emitter.emit('event', 'arg1', 'arg2');  // 可再次触发
emitter.emit('single');                  // 触发一次性监听器
emitter.emit('single');                  // 不再触发
```

### 错误处理

```javascript
// 默认: error 事件未处理会抛出异常
const emitter = new EventEmitter();
emitter.emit('error', new Error('something wrong'));
// 抛出: Error: something wrong

// 安全处理
emitter.on('error', (err) => {
  console.error('Error occurred:', err);
  // 记录日志、清理资源等
});

// 或使用 captureRejections (Node.js 14+)
const emitter = new EventEmitter({ captureRejections: true });
emitter.on('error', (err) => {
  // 处理错误
});
```

### 监听器管理

```javascript
const emitter = new EventEmitter();

// 移除特定监听器
function handler() {
  console.log('handler called');
}
emitter.on('event', handler);
emitter.off('event', handler);  // Node.js 10+ 推荐 off
// 或: emitter.removeListener('event', handler);

// 移除所有监听器
emitter.removeAllListeners('event');
emitter.removeAllListeners();  // 移除所有事件的所有监听器

// 获取监听器信息
console.log(emitter.listenerCount('event'));  // 监听器数量
console.log(emitter.getMaxListeners());       // 最大监听器数
console.log(emitter.listeners('event'));      // 监听器数组

// 设置最大监听器
emitter.setMaxListeners(20);
```

### 事件名称特性

```javascript
// 事件名称可以是任意字符串
emitter.on('custom-event', handler);
emitter.on('', handler);              // 空字符串可以
emitter.on('data', handler);
emitter.on('data', handler2);        // 同事件可有多个监听器

// Symbol 事件名
const COMPLETE = Symbol('complete');
emitter.on(COMPLETE, handler);

// 通配符 (需要 events.on 库)
emitter.on('user.*', handler);  // 匹配 user.created, user.deleted 等
```

---

## 常见模式

### 1. 发布/订阅 (Pub/Sub)

```javascript
class PubSub {
  constructor() {
    this.events = new Map();
  }
  
  subscribe(event, listener) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(listener);
    
    // 返回取消订阅函数
    return () => this.unsubscribe(event, listener);
  }
  
  unsubscribe(event, listener) {
    if (!this.events.has(event)) return;
    const listeners = this.events.get(event);
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  }
  
  publish(event, ...args) {
    if (!this.events.has(event)) return;
    this.events.get(event).forEach(listener => {
      listener(...args);
    });
  }
}

// 使用
const pubsub = new PubSub();
const unsubscribe = pubsub.subscribe('message', (msg) => {
  console.log('Received:', msg);
});

pubsub.publish('message', 'Hello!');  // Received: Hello!
unsubscribe();  // 取消订阅
```

### 2. 流程控制

```javascript
class FlowControl extends EventEmitter {
  constructor() {
    super();
    this.steps = [];
    this.currentStep = 0;
  }
  
  addStep(name, fn) {
    this.steps.push({ name, fn });
    return this;
  }
  
  async run(data) {
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      this.emit('step:start', step.name, i);
      
      try {
        data = await step.fn(data);
        this.emit('step:complete', step.name, data);
      } catch (err) {
        this.emit('step:error', step.name, err);
        throw err;
      }
    }
    this.emit('complete', data);
    return data;
  }
}

// 使用
const flow = new FlowControl();
flow.addStep('validate', async (data) => {
  if (!data.id) throw new Error('Missing ID');
  return data;
});
flow.addStep('transform', async (data) => {
  return { ...data, processed: true };
});

flow.on('step:complete', (name, data) => {
  console.log(`Step ${name} done`);
});

await flow.run({ id: 123 });
```

### 3. 状态机

```javascript
class StateMachine extends EventEmitter {
  constructor(initial) {
    super();
    this.currentState = initial;
    this.transitions = new Map();
  }
  
  addTransition(from, to, callback) {
    const key = `${from}->${to}`;
    this.transitions.set(key, { from, to, callback });
    return this;
  }
  
  transition(to) {
    const key = `${this.currentState}->${to}`;
    const transition = this.transitions.get(key);
    
    if (!transition) {
      throw new Error(`Invalid transition: ${this.currentState} -> ${to}`);
    }
    
    const from = this.currentState;
    this.currentState = to;
    
    this.emit('transition', from, to);
    this.emit(`${from}:exit`, to);
    this.emit(`${to}:enter`, from);
    
    if (transition.callback) {
      transition.callback(from, to);
    }
    
    return this;
  }
}

// 使用
const machine = new StateMachine('idle');
machine.addTransition('idle', 'loading', () => console.log('Loading...'));
machine.addTransition('loading', 'success', () => console.log('Success!'));
machine.addTransition('loading', 'error', () => console.log('Error!'));

machine.on('transition', (from, to) => {
  console.log(`State: ${from} -> ${to}`);
});

machine.transition('loading');
machine.transition('success');
```

---

## 常见问题

### Q: 为什么监听器数量有限制？

```javascript
// 默认限制是 10 个警告
emitter.on('event', () => {});  // ... 添加超过 10 个
// 警告: Possible EventEmitter memory leak detected

// 原因: 通常是忘记移除监听器的 bug
// 解决: 检查是否正确移除或设置更大的限制
emitter.setMaxListeners(50);

// 或完全禁用警告 (不推荐)
// emitter.setMaxListeners(Infinity);
```

### Q: once 和 on('error') 的执行顺序？

```javascript
const emitter = new EventEmitter();

// error 事件特殊处理，即使注册在 once 后也会被调用
emitter.once('error', () => console.log('error caught'));

emitter.emit('error', new Error('test'));
// 'error caught' 被输出

emitter.emit('error', new Error('test2'));
// 不会输出，因为 once 只触发一次
```

### Q: 如何让监听器异步执行？

```javascript
const emitter = new EventEmitter();

// 使用 setImmediate 或 nextTick
emitter.on('async-event', async (data) => {
  // 这样可以，但 emit 不会等待
});

// 要让 emit 等待所有监听器完成:
async function emitAsync(event, ...args) {
  const listeners = [...this._events.get(event) || []];
  await Promise.all(listeners.map(listener => 
    Promise.resolve(listener.apply(this, args))
  ));
}

// 或使用信号量模式
class AsyncEmitter extends EventEmitter {
  async emitAsync(event, ...args) {
    const promises = (this._events.get(event) || [])
      .map(listener => listener.apply(this, args));
    await Promise.allSettled(promises);
  }
}
```

---

## 与 Stream 的关系

```javascript
// Stream 继承自 EventEmitter
const { Readable } = require('stream');

class MyStream extends Readable {
  _read() {
    // Stream 的事件由内部 EventEmitter 管理
    this.emit('data', chunk);      // 发射 data 事件
    this.emit('end');              // 发射 end 事件
  }
}

// 可用的 Stream 事件 (都来自 EventEmitter):
// 'data', 'end', 'error', 'close', 'readable', 'pause', 'resume'
```

---

## 相关资源

- [[stream-types]] - Stream 类型详解 (基于 EventEmitter)
- [[concurrency-patterns]] - 并发控制模式
- [[express-middleware-chain]] - Express 中间件链 (基于 EventEmitter)
