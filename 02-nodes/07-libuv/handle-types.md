# libuv Handle Types

Handles in libuv represent long-lived objects that perform certain operations and dispatch callbacks.

## Handle Lifecycle

```
alloc → init → start → stop → close
```

## Handle Type Hierarchy

### 1.uv_handle_t (Base Type)
All handles inherit from this:
```c
struct uv_handle_t {
    void* data;              // User data
    uv_close_cb close_cb;   // Close callback
    uv_handle_type type;    // Handle type enum
    // ... internal fields
};
```

### 2. Request Handles

**uv_fs_t** - File operations
```c
uv_fs_t req;
uv_fs_open(loop, &req, path, flags, mode, callback);
// Types: open, close, read, write, unlink, mkdir, stat, etc.
```

**uv_work_t** - Thread pool work
```c
uv_work_t req;
uv_queue_work(loop, &req, work_cb, after_cb);
```

### 3. I/O Handles

**uv_stream_t** - Stream I/O base
- `uv_pipe_t` - Unix pipes / named pipes
- `uv_tcp_t` - TCP sockets
- `uv_udp_t` - UDP sockets
- `uv_tty_t` - Terminal TTY

```c
uv_pipe_t pipe;
uv_pipe_init(loop, &pipe, 0);
uv_pipe_open(&pipe, fd);  // Attach to existing fd
```

**uv_fs_event_t** - File system watcher
```c
uv_fs_event_t watcher;
uv_fs_event_init(loop, &watcher);
uv_fs_event_start(&watcher, callback, path, UV_FS_EVENT_RECURSIVE);
```

**uv_fs_poll_t** - File polling (stat-based)
```c
uv_fs_poll_t poll_handle;
uv_fs_poll_init(loop, &poll_handle);
uv_fs_poll_start(&poll_handle, callback, path, interval);
```

### 4. Timer Handles

**uv_timer_t** - One-shot and repeating timers
```c
uv_timer_t timer;
uv_timer_init(loop, &timer);
uv_timer_start(&timer, callback, timeout, repeat);
uv_timer_stop(&timer);
uv_timer_again(&timer);  // Restart with repeat interval
```

### 5. Process Handles

**uv_process_t** - Child processes
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

### 6. Signal Handle

**uv_signal_t** - Signal handling
```c
uv_signal_t sig;
uv_signal_init(loop, &sig);
uv_signal_start(&sig, callback, SIGINT);
```

## Handle Reference Counting

```c
uv_handle_t* handle;

// Increment reference (loop won't exit while ref'd)
uv_ref(handle);

// Decrement reference
uv_unref(handle);

// Check if active
uv_is_active(handle);

// Check if closing/closed
uv_is_closing(handle);
uv_is_closed(handle);
```

## Memory Management

- Handles are typically stack-allocated or heap-allocated
- Must call `uv_close()` to release resources
- Close callback fires when handle is fully closed
- Handle data (`handle->data`) for user storage
