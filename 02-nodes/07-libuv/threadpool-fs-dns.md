# libuv Threadpool: Architectural Analysis

## The Problem: Blocking the Event Loop

Node.js's single-threaded event loop can only do one thing at a time. When a CPU-bound or I/O-bound operation blocks, the entire application stalls. The libuv threadpool is the **escape hatch** for operations that cannot be made asynchronous.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Event Loop                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐              │
│  │ Timer   │  │  I/O    │  │ Check   │  │ Close   │              │
│  │ Queue   │  │ Poll    │  │ Queue   │  │ Queue   │              │
│  └────┬────┘  └────┬────┘  └────┬────┘  └─────────┘              │
│       │            │            │                                │
│       └────────────┴────────────┘                                │
│                    │                                             │
│            ┌───────▼───────┐                                     │
│            │  Executor     │ ◄── Single thread, processes one    │
│            │  (V8 Main)    │     callback at a time              │
│            └───────────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ Blocked by sync I/O?
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Threadpool (Worker Threads)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │  │ Worker 4 │  ...     │
│  │ (FS/DNS/ │  │ (FS/DNS/ │  │ (FS/DNS/ │  │ (FS/DNS/ │         │
│  │  Work)   │  │  Work)   │  │  Work)   │  │  Work)   │         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
│                                                                │
│  Default: 4 threads | Max: 1024 (UV_THREADPOOL_SIZE)           │
└─────────────────────────────────────────────────────────────────┘
```

## Design Decision: Why a Pre-allocated Threadpool?

**Alternative approaches considered:**

| Approach | Problem |
|----------|---------|
| Spawn thread per request | Thread creation overhead; unbounded memory |
| Use I/O completion ports (Windows) | Not portable across all platforms |
| Async I/O syscalls only | Not all filesystems support async operations |
| Process pool | High IPC overhead, complex communication |

**libuv's choice:** Fixed-size threadpool with a global queue. This is a **space-time tradeoff** — pre-allocating threads costs memory but eliminates spawn latency. The fixed bound prevents resource exhaustion at the cost of potential contention.

## Threadpool Size: Capacity Planning

### Default Behavior
```
UV_THREADPOOL_SIZE = 4  (minimum 1, maximum 1024)
```

### Sizing Formula

For I/O-bound operations, the optimal size depends on:
```
Optimal Threads = (Number of Cores × Target CPU Utilization) + 
                   (I/O Wait Time / Compute Time)
```

**Practical guidelines:**
- **File I/O heavy:** 8-16 threads (disk I/O can parallelize well)
- **DNS heavy:** 8 threads (short-lived requests)
- **CPU-bound work:** Fewer threads to avoid context switching overhead
- **Mixed workload:** Start at `2 × cores`, tune based on metrics

### Queue Backpressure

```
┌──────────────────────────────────────────────────────┐
│                  libuv Internal Queue               │
│                                                      │
│   [req1] [req2] [req3] ... [req1022] [req1023]       │
│                                                      │
│   Max: 1024 pending requests                         │
│   Overflow: UV_ENOBUFS returned                       │
└──────────────────────────────────────────────────────┘
```

**Architectural concern:** When the queue fills, new requests fail immediately. There's no **pushback mechanism** to notify the caller before submission. This is a deliberate simplicity trade-off — more sophisticated backpressure requires application-level coordination.

## Operations That Use the Threadpool

### 1. File System Operations

```
┌─────────────────────────────────────────────────────────────┐
│  uv_fs_* Function          │  Threadpool Needed?            │
├─────────────────────────────────────────────────────────────┤
│  uv_fs_open                │  ✓ Yes (can be async on some   │
│                             │    platforms but not all)      │
│  uv_fs_read/write          │  ✓ Yes                         │
│  uv_fs_close               │  ✓ Yes                         │
│  uv_fs_stat, lstat, fstat  │  ✓ Yes                         │
│  uv_fs_rename, unlink      │  ✓ Yes                         │
│  uv_fs_mkdir, rmdir        │  ✓ Yes                         │
│  uv_fs_scandir             │  ✓ Yes                         │
│  uv_fs_poll                │  ✗ No (uses stat/dirmon internally │
│                             │    but schedules differently)  │
└─────────────────────────────────────────────────────────────┘
```

### 2. DNS Resolution

```
┌─────────────────────────────────────────────────────────────┐
│  Platform        │  getaddrinfo Behavior                    │
├──────────────────┼─────────────────────────────────────────┤
│  Linux (glibc)   │  Async-native (often no threadpool)      │
│  Linux (musl)    │  Uses threadpool                         │
│  macOS           │  Uses threadpool                         │
│  Windows         │  Uses threadpool                         │
└─────────────────────────────────────────────────────────────┘
```

**Architecture note:** Linux with glibc can use `getaddrinfo_a` for true async DNS. libuv detects this and may bypass the threadpool. However, you cannot rely on this optimization.

### 3. User-Defined Work (`uv_queue_work`)

```c
// Architecture: How user work flows through the system
//
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Main Thread │     │  Queue       │     │  Worker Thread│
│              │     │              │     │              │
│  uv_queue_   │────▶│  work_cb     │────▶│  work_cb()   │
│  work()      │     │  queued      │     │  executes    │
│              │     │              │     │              │
│              │◀────│              │◀────│  after_cb()  │
│  after_cb()  │     │              │     │  queued back │
│  invoked     │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

```c
// Example: Offloading CPU-intensive work
void compute_hash(uv_work_t* req) {
    // Runs in worker thread — can block safely
    hash_data_t* data = (hash_data_t*) req->data;
    data->result = expensive_hash(data->input, data->len);
}

void on_hash_complete(uv_work_t* req) {
    // Runs back in event loop — safe to interact with V8
    hash_data_t* data = (hash_data_t*) req->data;
    printf("Hash: %s\n", data->result);
    
    // Clean up
    free(data->input);
    free(data);
    free(req);
}

// Submission
uv_work_t* work_req = malloc(sizeof(uv_work_t));
hash_data_t* data = malloc(sizeof(hash_data_t));
// ... populate data ...
work_req->data = data;
uv_queue_work(uv_default_loop(), work_req, compute_hash, on_hash_complete);
```

## Architectural Patterns

### Pattern 1: Bounded Parallelism with Semaphore

```c
// Problem: Threadpool has N workers, but you want to limit 
// concurrent operations to M (M < N) for resource control

typedef struct {
    uv_sem_t semaphore;
    int max_concurrent;
} bounded_context_t;

void bounded_work(uv_work_t* req) {
    bounded_context_t* ctx = (bounded_context_t*) req->data;
    uv_sem_wait(&ctx->semaphore);  // Block if M already running
    
    // Do work...
    
    uv_sem_post(&ctx->semaphore);
}
```

### Pattern 2: Priority Queue Routing

```c
// Problem: Some work is more urgent than others
// Solution: Multiple request types with different handling

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

// In practice: Use separate threadpools or application-level
// priority queue feeding into the threadpool
```

### Pattern 3: Work Coalescing

```c
// Problem: Many identical requests (e.g., stat calls for same file)
// Solution: Deduplicate before queueing

typedef struct {
    char* path;
    uv_work_t* pending_request;
    int ref_count;
    uv_mutex_t mutex;
} dedup_entry_t;

// Check before queueing — if same request is pending, wait for it
```

## Performance Characteristics

### Latency Profile

```
                    Threadpool Size = 4
                    
Time ─────────────────────────────────────────────────────▶
         
         ▲
  50ms   │ ████ Request 1 starts immediately
         │
  40ms   │       ████ Request 2 starts immediately
         │       
  30ms   │             ████ Request 3 starts immediately
         │             
  20ms   │                   ████ Request 4 starts immediately
         │                             
  10ms   │                                    
         │                                      ████ Request 5 WAITS
         │                                                    ████ Request 5 starts
         │
         0ms                                                60ms
         
         Thread 1: [████████████]
         Thread 2: [    ████████████]
         Thread 3: [        ████████████]
         Thread 4: [            ████████████]
         
         Request 5 queued: 40ms wait + 10ms execute = 50ms total
```

### Memory Overhead Per Thread

```
┌─────────────────────────────────────────────────┐
│  Per-Thread Stack: ~1MB (configurable)          │
│  Thread overhead: ~8KB (struct, TLS, etc.)     │
│                                                 │
│  At max (1024 threads):                        │
│    Stack: 1GB                                  │
│    Overhead: 8MB                               │
│                                                 │
│  ⚠️ Default (4 threads): 4MB + 32KB            │
└─────────────────────────────────────────────────┘
```

## Common Pitfalls

### 1. Blocking the Event Loop with Sync Operations

```c
// ❌ WRONG: Sync file operations in the main thread
void bad_handler(uv_fs_t* req) {
    // This blocks the ENTIRE event loop during execution
    int fd = uv_fs_open(loop, req, "file.txt", O_RDONLY, 0, NULL);
    // ... do more sync I/O ...
    uv_fs_close(loop, req, fd, NULL);
}

// ✅ CORRECT: Async with callback
void good_handler(uv_fs_t* req) {
    uv_fs_open(loop, req, "file", O_RDONLY, 0, on_open);
}
```

### 2. Exposing C Data to JavaScript Without Proper Handling

```c
// ❌ WRONG: Returning pointer to stack memory
void on_file_read(uv_work_t* req) {
    char buffer[1024];  // Stack memory — invalid after function returns!
    // ... fill buffer ...
    req->data = buffer;  // ❌ Dangling pointer!
}

// ✅ CORRECT: Heap-allocated or persistent data
void on_file_read(uv_work_t* req) {
    char* buffer = malloc(1024);  // Heap memory
    // ... fill buffer ...
    req->data = buffer;  // ✅ Valid pointer
}
```

### 3. Not Cleaning Up Requests

```c
// ❌ WRONG: Memory leak
void on_read(uv_fs_t* req) {
    process_data(req->buf->base, req->result);
    // Missing: uv_fs_req_cleanup(req);
}

// ✅ CORRECT: Always clean up
void on_read(uv_fs_t* req) {
    if (req->result >= 0) {
        process_data(req->buf->base, req->result);
    }
    uv_fs_req_cleanup(req);
}
```

## Monitoring and Observability

```c
// Architecture: How to instrument threadpool usage
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

// Expose via: /metrics endpoint, prometheus, etc.
```

## Summary: Architectural Trade-offs

| Aspect | Decision | Trade-off |
|--------|----------|-----------|
| Thread count | Fixed at startup | Predictable memory, but may under/over-utilize |
| Queue depth | Max 1024 | Prevents OOM, but causes UV_ENOBUFS under load |
| Scheduling | FIFO | Simple, but no priority |
| Thread creation | Eager | Memory cost, but no spawn latency |
| Platform support | Portable | Some optimizations (Linux async DNS) are optional |
| Backpressure | None | Simplicity vs. graceful degradation |

The threadpool is a **correctness solution first** — it exists to make operations that would otherwise block the event loop work at all. Performance optimization is secondary, which is why it lacks features like priority queuing or adaptive sizing.
