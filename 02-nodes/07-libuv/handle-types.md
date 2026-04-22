# libuv 句柄类型

libuv 中的句柄代表执行某些操作并调度回调的长期存活对象。

## 句柄生命周期

```
alloc → init → start → stop → close
```

## 句柄类型层次结构

### 1. uv_handle_t（基类型）

所有句柄都继承自此类型：
```c
struct uv_handle_t {
    void* data;              // 用户数据
    uv_close_cb close_cb;   // 关闭回调
    uv_handle_type type;    // 句柄类型枚举
    // ... 内部字段
};
```

### 2. 请求句柄

**uv_fs_t** - 文件操作
```c
uv_fs_t req;
uv_fs_open(loop, &req, path, flags, mode, callback);
// 类型：open, close, read, write, unlink, mkdir, stat 等
```

**uv_work_t** - 线程池工作
```c
uv_work_t req;
uv_queue_work(loop, &req, work_cb, after_cb);
```

### 3. I/O 句柄

**uv_stream_t** - 流 I/O 基类型
- `uv_pipe_t` - Unix 管道 / 命名管道
- `uv_tcp_t` - TCP 套接字
- `uv_udp_t` - UDP 套接字
- `uv_tty_t` - 终端 TTY

```c
uv_pipe_t pipe;
uv_pipe_init(loop, &pipe, 0);
uv_pipe_open(&pipe, fd);  // 附加到现有 fd
```

**uv_fs_event_t** - 文件系统监视器
```c
uv_fs_event_t watcher;
uv_fs_event_init(loop, &watcher);
uv_fs_event_start(&watcher, callback, path, UV_FS_EVENT_RECURSIVE);
```

**uv_fs_poll_t** - 文件轮询（基于 stat）
```c
uv_fs_poll_t poll_handle;
uv_fs_poll_init(loop, &poll_handle);
uv_fs_poll_start(&poll_handle, callback, path, interval);
```

### 4. 定时器句柄

**uv_timer_t** - 单次和重复定时器
```c
uv_timer_t timer;
uv_timer_init(loop, &timer);
uv_timer_start(&timer, callback, timeout, repeat);
uv_timer_stop(&timer);
uv_timer_again(&timer);  // 使用重复间隔重新启动
```

### 5. 进程句柄

**uv_process_t** - 子进程
```c
uv_process_options_t opts = {
    .file = "cmd",
    .args = args,
    .exit_cb = exit_callback
};
uv_process_t child;
uv_spawn(loop, &child, &opts);
uv_process_kill(&child, SIGTERM);
```

### 6. 信号句柄

**uv_signal_t** - 信号处理
```c
uv_signal_t sig;
uv_signal_init(loop, &sig);
uv_signal_start(&sig, callback, SIGINT);
```

## 句柄引用计数

```c
uv_handle_t* handle;

// 增加引用（引用期间循环不会退出）
uv_ref(handle);

// 减少引用
uv_unref(handle);

// 检查是否活动
uv_is_active(handle);

// 检查是否正在关闭/已关闭
uv_is_closing(handle);
uv_is_closed(handle);
```

## 内存管理

- 句柄通常在栈上分配或堆分配
- 必须调用 `uv_close()` 释放资源
- 句柄完全关闭时触发关闭回调
- 句柄数据 (`handle->data`) 用于用户存储
