# libuv Cross-Platform I/O

libuv abstracts platform-specific I/O mechanisms behind a unified API.

## Backend Mechanisms

| Platform | I/O Mechanism |
|----------|---------------|
| Linux (2.6+) | epoll |
| macOS, BSD | kqueue |
| Windows | IOCP (I/O Completion Ports) |
| Solaris | event ports |
| ANSI C (fallback) | select() |

## TCP Socket Operations

```c
uv_tcp_t socket;

// Initialize
uv_tcp_init(loop, &socket);

// Bind to address
struct sockaddr_in addr;
uv_ip4_addr("0.0.0.0", 8080, &addr);
uv_tcp_bind(&socket, (const struct sockaddr*)&addr, 0);

// Connect
uv_tcp_connect(&connect_req, &socket, addr, callback);

// Or accept incoming
uv_listen((uv_stream_t*)&socket, 128, on_connection);
```

## UDP Socket Operations

```c
uv_udp_t udp;
uv_udp_init(loop, &udp);
uv_udp_bind(&udp, (const struct sockaddr*)&addr, UV_UDP_REUSEADDR);
uv_udp_recv_start(&udp, alloc_buffer, on_udp_read);
uv_udp_send(&udp, &send_req, buffers, nbufs, addr, callback);
```

## Pipe Operations

### Anonymous Pipes (Unix) / Named Pipes (Windows)

```c
uv_pipe_t pair[2];
uv_pipe(loop, &pair[0], &pair[1], 0, 0);  // Unix: creates socketpair
uv_pipe(loop, &pair[0], &pair[1], 0, 1);  // IPC pipe on Windows

// Or for named pipes:
uv_pipe_t server;
uv_pipe_init(loop, &server, 0);
uv_pipe_bind(&server, "\\\\.\\pipe\\mypipe");
uv_listen((uv_stream_t*)&server, 128, connection_cb);
```

## TTY Terminal Operations

```c
uv_tty_t tty;
uv_tty_init(loop, &tty, fd, 1);  // readable = 1

// Set mode
uv_tty_set_mode(&tty, UV_TTY_MODE_RAW);

// Reset on exit
uv_tty_reset_mode();
```

## Platform-Specific Considerations

### File Descriptor Limitations

**Linux**: `ulimit -n` for max fds
**macOS**: `ulimit -n` also applies, softer limits
**Windows**: Sockets and handles use separate pools

### IPv6 Handling

```c
uv_tcp_init(loop, &tcp);
uv_tcp_ipv6only(&tcp, 1);  // Only bind to IPv6
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

## Buffers and Memory

```c
// libuv manages memory through uv_buf_t
typedef struct {
    char* base;  // Buffer start
    size_t len;  // Buffer length
} uv_buf_t;

// Allocation callback pattern
void alloc_buffer(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
    buf->base = malloc(suggested_size);
    buf->len = suggested_size;
}
```

## Stream I/O

```c
// Generic stream operations work on TCP, Pipe, TTY
uv_stream_t* stream = (uv_stream_t*)&tcp;

uv_read_start(stream, alloc_buffer, on_read);   // Start reading
uv_read_stop(stream);                            // Stop reading
uv_write(&write_req, stream, &buffers, n, cb);   // Write
uv_shutdown(&shutdown_req, stream, cb);          // Half-close
uv_try_write(stream, &buffers, n);               // Non-blocking write
```

## Polling File Descriptors

```c
uv_poll_t poll_handle;
uv_poll_init(loop, &poll_handle, fd);
uv_poll_start(&poll_handle, UV_READABLE|UV_WRITABLE, poll_callback);
uv_poll_stop(&poll_handle);

void poll_callback(uv_poll_t* handle, int status, int events) {
    if (status < 0) { /* error */ }
    if (events & UV_READABLE) { /* can read */ }
    if (events & UV_WRITABLE) { /* can write */ }
}
```
