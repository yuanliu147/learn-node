# libuv Run Phases

libuv operates through distinct phases when running an event loop, managing callbacks and I/O operations systematically.

## Phase Order

The libuv event loop runs through these phases in order:

1. **Timers** - Execute callbacks scheduled by `uv_timer_start()`
2. **Pending** - Execute I/O callbacks that were deferred from the previous iteration
3. **Idle** - Execute idle handles (platform-specific)
4. **Prepare** - Execute prepare handles before polling for I/O
5. **Poll** - Poll for new I/O events (kqueue/epoll/etc.)
6. **Check** - Execute check handles immediately after polling
7. **Closing** - Execute close callbacks for handles being closed
8. **Ref** - Process referenced handles to keep loop alive

## uv_run() Modes

```c
// Three modes of running the event loop
uv_run(uv_loop_t* loop, uv_run_mode mode);

typedef enum {
    UV_RUN_DEFAULT,  // Run until all handles complete
    UV_RUN_ONCE,     // Poll for I/O once, run callbacks
    UV_RUN_NOWAIT    // Run callbacks without polling for I/O
} uv_run_mode;
```

## Phase Details

### Timers Phase
- Sorted priority queue of timer callbacks
- Executes all timers whose deadline has passed
- `uv_timer_start()` / `uv_timer_stop()` / `uv_timer_again()`

### Poll Phase
- Blocks until fd is readable/writable or timeout
- If no handles active, uses UV_RUN_NOWAIT behavior
- Platform-specific: epoll (Linux), kqueue (macOS/BSD), IOCP (Windows)

### Check Phase
- Designed for pairing with Poll phase
- Callbacks here run immediately after I/O polling
- Useful for "immediate after I/O" work

## Backend Iteration

```c
// Internal loop structure (simplified)
while (!loop->stop_flag) {
    uv__update_time(loop);        // Update current time
    uv__run_timers(loop);          // Phase 1
    uv__run_closing_handles(loop); // Phase 7
    if (loop->stop_flag) break;
    
    // Poll for I/O
    uv__io_poll(loop, timeout);
    
    // Process immediate callbacks
    uv__process_immediate(loop);
}
```

## Practical Implications

- Timers are **not** affected by poll blocking
- Timer sequence: timers fire in order, independent of other phases
- `uv_run(UV_RUN_NOWAIT)` never blocks in poll phase
- Proper handle/reference management keeps loop alive
