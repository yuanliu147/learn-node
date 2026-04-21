# libuv Threadpool: FS & DNS Operations

libuv uses a thread pool for operations that would otherwise block the event loop.

## Threadpool Size

Default: **4 threads** (can process 4 operations concurrently)
Maximum: **1024 threads** (via `UV_THREADPOOL_SIZE` env var)

```bash
export UV_THREADPOOL_SIZE=8  # Set before application starts
```

## Operations Using Threadpool

### 1. File System Operations

All `uv_fs_*` functions except `uv_fs_poll` use the thread pool:

```c
uv_fs_t req;

// These all go to threadpool:
uv_fs_open(loop, &req, "file.txt", O_RDONLY, 0, callback);
uv_fs_read(loop, &req, fd, buffer, 4096, 0, callback);
uv_fs_write(loop, &req, fd, buffer, 4096, 0, callback);
uv_fs_close(loop, &req, fd, callback);
uv_fs_stat(loop, &req, "path", callback);
uv_fs_rename(loop, &req, old, new, callback);
uv_fs_unlink(loop, &req, path, callback);
uv_fs_mkdir(loop, &req, path, 0755, callback);
uv_fs_rmdir(loop, &req, path, callback);
uv_fs_scandir(loop, &req, path, 0, callback);
```

### 2. DNS Operations

Network operations that need resolution:

```c
uv_getaddrinfo_t req;
uv_getaddrinfo(loop, &req, callback, hostname, service, hints);

// Also uses threadpool:
uv_getnameinfo(loop, &req, callback, addr, flags);
```

**Note:** On some platforms (Linux with glibc), `getaddrinfo` is async-native.

### 3. User-Defined Work

Custom work for the threadpool:

```c
void work_callback(uv_work_t* req) {
    // Runs in threadpool thread
    // Do blocking/slow work here
}

void after_callback(uv_work_t* req) {
    // Runs in event loop after work completes
}

uv_work_t work_req;
uv_queue_work(loop, &work_req, work_callback, after_callback);
```

## Request Structure

```c
typedef struct uv_fs_s {
    uv_req_t req;           // Base request
    uv_fs_type fs_type;     // Operation type
    uv_loop_t* loop;        // Event loop
    void* data;             // User data
    ssize_t result;         // Operation result (error code or bytes)
    // operation-specific fields...
} uv_fs_t;
```

## Callback Pattern

```c
void fs_callback(uv_fs_t* req) {
    if (req->result < 0) {
        fprintf(stderr, "FS error: %s\n", uv_strerror(req->result));
    } else {
        // Use req->result (bytes for read/write, fd for open, etc.)
    }
    // Always clean up request when done
    uv_fs_req_cleanup(req);
}
```

## Synchronous Wait

```c
uv_fs_t req;
uv_fs_open(loop, &req, "file.txt", O_RDONLY, 0, NULL);  // NULL = sync
int fd = req.result;
uv_fs_req_cleanup(&req);
```

## Threadpool Scheduling

```
Main Thread          Threadpool
    |                    |
    |--- uv_fs_open ---> | worker 1
    |--- uv_fs_read ---> | worker 2
    |--- uv_fs_write --> | worker 3
    |--- uv_work ------> | worker 4
    |                    | (max 4 concurrent by default)
    |                    |
    |<-- callback -------| (when any completes)
```

## Queue Depth Limits

- libuv 1.x: Maximum 1024 pending requests
- Exceeding this returns `UV_ENOBUFS`
- Real limit is lower due to internal queues
