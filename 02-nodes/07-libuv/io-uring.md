# libuv 中的 io_uring

io_uring 是 Linux 的高性能异步 I/O 接口，在 libuv 中作为可选后端提供。

## 概述

io_uring 提供：
- 通过共享环形缓冲区的**零拷贝操作**
- **提交队列（SQ）**用于发送请求
- **完成队列（CQ）**用于接收结果
- **轮询模式**实现最低延迟

## libuv 后端选择

```bash
# 强制使用 io_uring 后端
UV_USE_IO_URING=1 ./your_app

# 或以编程方式（libuv 1.46+）
uv_loop_configure(loop, UV_LOOP_BACKEND_IORING);
```

## 启用 io_uring

```c
// 检查 io_uring 是否可用
int available;
uv_backend_fd(loop, &available);
uv_loop_configure(loop, UV_LOOP_BACKEND_IORING);  // 如果不可用可能会失败
```

## 使用 io_uring 的文件操作

```c
// 打开文件
uv_fs_t open_req;
uv_fs_open(loop, &open_req, "file.txt", O_RDONLY, 0, callback);

// 读取文件
uv_buf_t bufs[1];
bufs[0] = uv_buf_init(buffer, sizeof(buffer));
uv_fs_read(loop, &read_req, open_req.result, bufs, 1, -1, callback);

// 写入文件  
uv_fs_write(loop, &write_req, fd, bufs, 1, -1, callback);
```

## io_uring 特定功能

### 环形缓冲区设置

```
用户空间                    内核
+-----------+                +-----------+
|   SQ      | ----submit---> |   SQ      |
+-----------+                +-----------+
|   CQ      | <---result---- |   CQ      |
+-----------+                +-----------+
```

### 轮询 I/O 模式

```c
// 启用内核侧轮询（减少系统调用）
uv_loop_configure(loop, UV_LOOP_BACKEND_IORING_POLL);
```

## 性能优势

| 方面 | epoll | io_uring |
|------|-------|----------|
| 每次操作的系统调用 | 2+ | 1（批量） |
| 内存拷贝 | 多次 | 共享内存 |
| 功能 | 仅事件 | 事件 + 数据 |
| 内核轮询支持 | 否 | 是 |

## 限制

- 需要 **Linux 5.1+**（完整功能需要 5.6+）
- 在非 Linux 系统上不可用
- 如果不可用则回退到 epoll
- 某些操作仍需要线程池

## 当前 libuv 支持（截至 1.46+）

```c
// 通过 io_uring 原生支持的操作：
// - 文件 I/O：open, close, read, write, stat 等
// - 套接字 I/O：仍使用 epoll 处理网络事件

// 仍使用线程池的操作：
// - DNS 查找（getaddrinfo）
// - 某些配置下的 FS 操作
```

## 实际使用

```c
int main() {
    uv_loop_t* loop = uv_loop_new();
    
    // 让 libuv 选择最佳后端
    // 在支持的系统上会自动使用 io_uring
    
    uv_fs_open(loop, &req, "test.txt", O_RDONLY, 0, on_open);
    
    uv_run(loop, UV_RUN_DEFAULT);
    uv_loop_close(loop);
}
```

## 错误处理

```c
void callback(uv_fs_t* req) {
    if (req->result < 0) {
        // io_uring 错误是负的 errno 值
        fprintf(stderr, "io_uring error: %s\n", uv_strerror(req->result));
    }
}
```
