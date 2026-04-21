# io_uring in libuv

io_uring is Linux's high-performance async I/O interface, available in libuv as an optional backend.

## Overview

io_uring provides:
- **Zero-copy operations** via shared ring buffers
- **Submission queue (SQ)** for sending requests
- **Completion queue (CQ)** for receiving results
- **Polled mode** for lowest latency

## libuv Backend Selection

```bash
# Force io_uring backend
UV_USE_IO_URING=1 ./your_app

# Or programmatically (libuv 1.46+)
uv_loop_configure(loop, UV_LOOP_BACKEND_IORING);
```

## Enabling io_uring

```c
// Check if io_uring is available
int available;
uv_backend_fd(loop, &available);
uv_loop_configure(loop, UV_LOOP_BACKEND_IORING);  // May fail if not available
```

## File Operations with io_uring

```c
// Open file
uv_fs_t open_req;
uv_fs_open(loop, &open_req, "file.txt", O_RDONLY, 0, callback);

// Read file
uv_buf_t bufs[1];
bufs[0] = uv_buf_init(buffer, sizeof(buffer));
uv_fs_read(loop, &read_req, open_req.result, bufs, 1, -1, callback);

// Write file  
uv_fs_write(loop, &write_req, fd, bufs, 1, -1, callback);
```

## io_uring Specific Features

### Ring Buffer Setup

```
User Space                    Kernel
+-----------+                +-----------+
|   SQ      | ----submit---> |   SQ      |
+-----------+                +-----------+
|   CQ      | <---result---- |   CQ      |
+-----------+                +-----------+
```

### Polled I/O Mode

```c
// Enable kernel-side polling (reduces syscalls)
uv_loop_configure(loop, UV_LOOP_BACKEND_IORING_POLL);
```

## Performance Benefits

| Aspect | epoll | io_uring |
|--------|-------|----------|
| Syscalls per operation | 2+ | 1 (batch) |
| Memory copies | Multiple | Shared memory |
| Features | Events only | Events + data |
| Kernel poll support | No | Yes |

## Limitations

- **Linux 5.1+** required (5.6+ for full features)
- Not available on non-Linux systems
- Falls back to epoll if unavailable
- Some operations still require thread pool

## Current libuv Support (as of 1.46+)

```c
// Operations supported natively via io_uring:
// - File I/O: open, close, read, write, stat, etc.
// - Socket I/O: still uses epoll for network events

// Operations that still use threadpool:
// - DNS lookups (getaddrinfo)
// - FS operations on some configurations
```

## Practical Usage

```c
int main() {
    uv_loop_t* loop = uv_loop_new();
    
    // Let libuv choose best backend
    // io_uring will be used automatically on supported systems
    
    uv_fs_open(loop, &req, "test.txt", O_RDONLY, 0, on_open);
    
    uv_run(loop, UV_RUN_DEFAULT);
    uv_loop_close(loop);
}
```

## Error Handling

```c
void callback(uv_fs_t* req) {
    if (req->result < 0) {
        // io_uring errors are negative errno values
        fprintf(stderr, "io_uring error: %s\n", uv_strerror(req->result));
    }
}
```
