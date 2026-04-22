# libuv 线程池：架构分析

## 问题：阻塞事件循环

Node.js 的单线程事件循环一次只能做一件事。当 CPU 密集型或 I/O 密集型操作阻塞时，整个应用程序就会停滞。libuv 线程池是那些无法异步化的操作的**逃生通道**。

```
┌─────────────────────────────────────────────────────────────────┐
│                        事件循环                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │ 定时器  │  │  I/O    │  │ 检查    │  │ 关闭    │          │
│  │ 队列    │  │ 轮询    │  │ 队列    │  │ 队列    │          │
│  └────┬────┘  └────┬────┘  └────┬────┘  └─────────┘          │
│       │            │            │                              │
│       └────────────┴────────────┘                              │
│                    │                                           │
│            ┌───────▼───────┐                                  │
│            │  执行器       │ ◄── 单线程，一次处理一个        │
│            │  (V8 主线程)  │     回调                        │
│            └───────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ 被同步 I/O 阻塞？
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     线程池（工作线程）                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ 工作线程1 │  │ 工作线程2 │  │ 工作线程3 │  │ 工作线程4 │  ... │
│  │ (FS/DNS/ │  │ (FS/DNS/ │  │ (FS/DNS/ │  │ (FS/DNS/ │     │
│  │  工作)   │  │  工作)   │  │  工作)   │  │  工作)   │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│                                                                │
│  默认：4 线程 | 最大：1024 (UV_THREADPOOL_SIZE)              │
└─────────────────────────────────────────────────────────────────┘
```

## 设计决策：为什么使用预分配线程池？

**考虑的替代方案：**

| 方案 | 问题 |
|------|------|
| 每个请求生成一个线程 | 线程创建开销；无限制内存使用 |
| 使用 I/O 完成端口（Windows） | 不可跨平台 |
| 仅使用异步 I/O 系统调用 | 并非所有文件系统都支持异步操作 |
| 进程池 | 高 IPC 开销，通信复杂 |

**libuv 的选择：** 固定大小的线程池配全局队列。这是一个**空间-时间权衡**——预分配线程消耗内存，但消除了生成延迟。固定边界防止资源耗尽，但可能带来争用开销。

## 线程池大小：容量规划

### 默认行为
```
UV_THREADPOOL_SIZE = 4  (最小 1，最大 1024)
```

### 规模公式

对于 I/O 密集型操作，最佳大小取决于：
```
最佳线程数 = (CPU 核心数 × 目标 CPU 利用率) + 
             (I/O 等待时间 / 计算时间)
```

**实践指南：**
- **文件 I/O 密集型：** 8-16 线程（磁盘 I/O 可以很好地并行化）
- **DNS 密集型：** 8 线程（短期请求）
- **CPU 密集型工作：** 更少线程以避免上下文切换开销
- **混合工作负载：** 从 `2 × 核心数` 开始，根据指标调整

### 队列背压

```
┌──────────────────────────────────────────────────────┐
│                  libuv 内部队列                       │
│                                                      │
│   [req1] [req2] [req3] ... [req1022] [req1023]       │
│                                                      │
│   最大：1024 个待处理请求                             │
│   溢出：返回 UV_ENOBUFS                              │
└──────────────────────────────────────────────────────┘
```

**架构关注点：** 当队列满时，新请求立即失败。在提交之前没有**回压机制**通知调用者。这是一个刻意的简单性权衡——更复杂的背压需要应用程序级协调。

## 使用线程池的操作

### 1. 文件系统操作

```
┌─────────────────────────────────────────────────────────────┐
│  uv_fs_* 函数              │  需要线程池？                   │
├─────────────────────────────────────────────────────────────┤
│  uv_fs_open                │  ✓ 是（某些平台上可以是异步的  │
│                             │    但不是所有）              │
│  uv_fs_read/write          │  ✓ 是                         │
│  uv_fs_close               │  ✓ 是                         │
│  uv_fs_stat, lstat, fstat  │  ✓ 是                         │
│  uv_fs_rename, unlink      │  ✓ 是                         │
│  uv_fs_mkdir, rmdir        │  ✓ 是                         │
│  uv_fs_scandir             │  ✓ 是                         │
│  uv_fs_poll                │  ✗ 否（内部使用 stat/dirmon   │
│                             │    但调度方式不同）           │
└─────────────────────────────────────────────────────────────┘
```

### 2. DNS 解析

```
┌─────────────────────────────────────────────────────────────┐
│  平台              │  getaddrinfo 行为                      │
├──────────────────┼─────────────────────────────────────────┤
│  Linux (glibc)   │  原生异步（通常不需要线程池）           │
│  Linux (musl)    │  使用线程池                            │
│  macOS           │  使用线程池                            │
│  Windows         │  使用线程池                            │
└─────────────────────────────────────────────────────────────┘
```

**架构注意：** 配备 glibc 的 Linux 可以使用 `getaddrinfo_a` 实现真正的异步 DNS。libuv 检测到这一点可能会绕过线程池。但是，你不能依赖这个优化。

### 3. 用户定义工作 (`uv_queue_work`)

```c
// 架构：用户工作如何流经系统
//
// ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
// │  主线程      │     │  队列        │     │  工作线程    │
// │              │     │              │     │              │
// │  uv_queue_   │────▶│  work_cb     │────▶│  work_cb()   │
// │  work()      │     │  已入队      │     │  执行中      │
// │              │     │              │     │              │
// │              │◀────│              │◀────│  after_cb()  │
// │  after_cb()  │     │              │     │  排队返回    │
// │  被调用      │     │              │     │              │
// └──────────────┘     └──────────────┘     └──────────────┘
```

```c
// 示例：卸载 CPU 密集型工作
void compute_hash(uv_work_t* req) {
    // 在工作线程中运行——可以安全阻塞
    hash_data_t* data = (hash_data_t*) req->data;
    data->result = expensive_hash(data->input, data->len);
}

void on_hash_complete(uv_work_t* req) {
    // 在事件循环中运行——可以安全与 V8 交互
    hash_data_t* data = (hash_data_t*) req->data;
    printf("Hash: %s\n", data->result);
    
    // 清理
    free(data->input);
    free(data);
    free(req);
}

// 提交
uv_work_t* work_req = malloc(sizeof(uv_work_t));
hash_data_t* data = malloc(sizeof(hash_data_t));
// ... 填充数据 ...
work_req->data = data;
uv_queue_work(uv_default_loop(), work_req, compute_hash, on_hash_complete);
```

## 架构模式

### 模式 1：使用信号量的有限并行

```c
// 问题：线程池有 N 个工作线程，但你想限制
// 并发操作为 M (M < N) 以进行资源控制

typedef struct {
    uv_sem_t semaphore;
    int max_concurrent;
} bounded_context_t;

void bounded_work(uv_work_t* req) {
    bounded_context_t* ctx = (bounded_context_t*) req->data;
    uv_sem_wait(&ctx->semaphore);  // 如果 M 已在运行则阻塞
    
    // 做工作...
    
    uv_sem_post(&ctx->semaphore);
}
```

### 模式 2：优先级队列路由

```c
// 问题：有些工作比其他工作更紧急
// 解决方案：具有不同处理方式的多种请求类型

typedef enum {
    PRIORITY_HIGH = 0,
    PRIORITY_NORMAL = 1,
    PRIORITY_LOW = 2
} work_priority_t;

typedef struct {
    uv_work_t work;
    work_priority_t priority;
    void* payload;
} prioritized_work_t;

// 实际上：使用单独的线程池或应用程序级
// 优先级队列馈送到线程池
```

### 模式 3：工作合并

```c
// 问题：许多相同请求（例如对同一文件的 stat 调用）
// 解决方案：入队前去重

typedef struct {
    char* path;
    uv_work_t* pending_request;
    int ref_count;
    uv_mutex_t mutex;
} dedup_entry_t;

// 入队前检查——如果相同请求正在等待，则等待
```

## 性能特性

### 延迟分布

```
                    线程池大小 = 4
                    
时间 ─────────────────────────────────────────────────────▶
         
         ▲
  50ms   │ ████ 请求 1 立即开始
         │
  40ms   │       ████ 请求 2 立即开始
         │       
  30ms   │             ████ 请求 3 立即开始
         │             
  20ms   │                   ████ 请求 4 立即开始
         │                             
  10ms   │                                  
         │                                      ████ 请求 5 等待
         │                                                    ████ 请求 5 开始
         │
         0ms                                                60ms
         
         线程 1: [████████████]
         线程 2: [    ████████████]
         线程 3: [        ████████████]
         线程 4: [            ████████████]
         
         请求 5 入队：40ms 等待 + 10ms 执行 = 50ms 总计
```

### 每线程内存开销

```
┌─────────────────────────────────────────────────┐
│  每线程栈：约 1MB（可配置）                     │
│  线程开销：约 8KB（结构体、TLS 等）            │
│                                                 │
│  最大（1024 线程）时：                         │
│    栈：1GB                                     │
│    开销：8MB                                   │
│                                                 │
│  ⚠️ 默认（4 线程）：4MB + 32KB                 │
└─────────────────────────────────────────────────┘
```

## 常见陷阱

### 1. 使用同步操作阻塞事件循环

```c
// ❌ 错误：在主线程中进行同步文件操作
void bad_handler(uv_fs_t* req) {
    // 这在整个执行期间阻塞事件循环
    int fd = uv_fs_open(loop, req, "file.txt", O_RDONLY, 0, NULL);
    // ... 做更多同步 I/O ...
    uv_fs_close(loop, req, fd, NULL);
}

// ✅ 正确：使用回调的异步方式
void good_handler(uv_fs_t* req) {
    uv_fs_open(loop, req, "file", O_RDONLY, 0, on_open);
}
```

### 2. 向 JavaScript 暴露 C 数据时没有适当处理

```c
// ❌ 错误：返回指向栈内存的指针
void on_file_read(uv_work_t* req) {
    char buffer[1024];  // 栈内存——函数返回后无效！
    // ... 填充缓冲区 ...
    req->data = buffer;  // ❌ 悬空指针！
}

// ✅ 正确：堆分配或持久化数据
void on_file_read(uv_work_t* req) {
    char* buffer = malloc(1024);  // 堆内存
    // ... 填充缓冲区 ...
    req->data = buffer;  // ✅ 有效指针
}
```

### 3. 没有清理请求

```c
// ❌ 错误：内存泄漏
void on_read(uv_fs_t* req) {
    process_data(req->buf->base, req->result);
    // 缺少：uv_fs_req_cleanup(req);
}

// ✅ 正确：始终清理
void on_read(uv_fs_t* req) {
    if (req->result >= 0) {
        process_data(req->buf->base, req->result);
    }
    uv_fs_req_cleanup(req);
}
```

## 监控和可观测性

```c
// 架构：如何检测线程池使用情况
typedef struct {
    uv_mutex_t mutex;
    uint64_t submitted;
    uint64_t completed;
    uint64_t in_flight;
} threadpool_metrics_t;

void wrap_work(uv_work_t* req) {
    threadpool_metrics_t* m = (threadpool_metrics_t*) req->data;
    
    uv_mutex_lock(&m->mutex);
    m->submitted++;
    m->in_flight++;
    uv_mutex_unlock(&m->mutex);
    
    actual_work(req);
    
    uv_mutex_lock(&m->mutex);
    m->completed++;
    m->in_flight--;
    uv_mutex_unlock(&m->mutex);
}

// 通过：/metrics 端点、prometheus 等暴露
```

## 总结：架构权衡

| 方面 | 决策 | 权衡 |
|------|------|------|
| 线程数 | 启动时固定 | 可预测内存，但可能利用不足/过度 |
| 队列深度 | 最大 1024 | 防止 OOM，但在负载下导致 UV_ENOBUFS |
| 调度 | FIFO | 简单，但没有优先级 |
| 线程创建 |  eager | 内存成本，但没有生成延迟 |
| 平台支持 | 可移植 | 某些优化（Linux 异步 DNS）是可选的 |
| 背压 | 无 | 简单性 vs. 优雅降级 |

线程池首先是一个**正确性解决方案**——它的存在是为了使那些会阻塞事件循环的操作能够工作。性能优化是次要的，这就是为什么它缺乏优先级队列或自适应大小等功能。
