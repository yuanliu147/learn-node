# libuv 跨平台 I/O

libuv 在统一的 API 背后抽象了特定平台的 I/O 机制。

## 后端机制

| 平台 | I/O 机制 |
|------|----------|
| Linux (2.6+) | epoll |
| macOS, BSD | kqueue |
| Windows | IOCP (I/O 完成端口) |
| Solaris | 事件端口 |
| ANSI C（后备） | select() |

## TCP 套接字操作

```c
uv_tcp_t socket;

// 初始化
uv_tcp_init(loop, &socket);

// 绑定地址
struct sockaddr_in addr;
uv_ip4_addr("0.0.0.0", 8080, &addr);
uv_tcp_bind(&socket, (const struct sockaddr*)&addr, 0);

// 连接
uv_tcp_connect(&connect_req, &socket, addr, callback);

// 或接受传入连接
uv_listen((uv_stream_t*)&socket, 128, on_connection);
```

## UDP 套接字操作

```c
uv_udp_t udp;
uv_udp_init(loop, &udp);
uv_udp_bind(&udp, (const struct sockaddr*)&addr, UV_UDP_REUSEADDR);
uv_udp_recv_start(&udp, alloc_buffer, on_udp_read);
uv_udp_send(&udp, &send_req, buffers, nbufs, addr, callback);
```

## 管道操作

### 匿名管道（Unix）/命名管道（Windows）

```c
uv_pipe_t pair[2];
uv_pipe(loop, &pair[0], &pair[1], 0, 0);  // Unix：创建 socketpair
uv_pipe(loop, &pair[0], &pair[1], 0, 1);  // Windows 上的 IPC 管道

// 或用于命名管道：
uv_pipe_t server;
uv_pipe_init(loop, &server, 0);
uv_pipe_bind(&server, "\\\\.\\pipe\\mypipe");
uv_listen((uv_stream_t*)&server, 128, connection_cb);
```

## TTY 终端操作

```c
uv_tty_t tty;
uv_tty_init(loop, &tty, fd, 1);  // readable = 1

// 设置模式
uv_tty_set_mode(&tty, UV_TTY_MODE_RAW);

// 退出时重置
uv_tty_reset_mode();
```

## 平台特定注意事项

### 文件描述符限制

**Linux**：`ulimit -n` 用于最大文件描述符
**macOS**：`ulimit -n` 也适用，限制更软
**Windows**：套接字和句柄使用单独的池

### IPv6 处理

```c
uv_tcp_init(loop, &tcp);
uv_tcp_ipv6only(&tcp, 1);  // 仅绑定到 IPv6
uv_ip6_addr("::", port, &addr);
```

### SO_REUSEPORT

```c
uv_tcp_t servers[4];
for (int i = 0; i < 4; i++) {
    uv_tcp_init(loop, &servers[i]);
    uv_tcp_bind(&servers[i], addr, UV_TCP_REUSEPORT);
    uv_listen((uv_stream_t*)&servers[i], 128, on_conn);
}
```

## 缓冲区和内存

```c
// libuv 通过 uv_buf_t 管理内存
typedef struct {
    char* base;  // 缓冲区起始
    size_t len;  // 缓冲区长度
} uv_buf_t;

// 分配回调模式
void alloc_buffer(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
    buf->base = malloc(suggested_size);
    buf->len = suggested_size;
}
```

## 流 I/O

```c
// 通用流操作适用于 TCP、管道、TTY
uv_stream_t* stream = (uv_stream_t*)&tcp;

uv_read_start(stream, alloc_buffer, on_read);   // 开始读取
uv_read_stop(stream);                            // 停止读取
uv_write(&write_req, stream, &buffers, n, cb);   // 写入
uv_shutdown(&shutdown_req, stream, cb);          // 半关闭
uv_try_write(stream, &buffers, n);               // 非阻塞写入
```

## 轮询文件描述符

```c
uv_poll_t poll_handle;
uv_poll_init(loop, &poll_handle, fd);
uv_poll_start(&poll_handle, UV_READABLE|UV_WRITABLE, poll_callback);
uv_poll_stop(&poll_handle);

void poll_callback(uv_poll_t* handle, int status, int events) {
    if (status < 0) { /* 错误 */ }
    if (events & UV_READABLE) { /* 可以读取 */ }
    if (events & UV_WRITABLE) { /* 可以写入 */ }
}
```
