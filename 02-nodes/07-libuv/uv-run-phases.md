# libuv 运行阶段

libuv 在运行事件循环时通过不同的阶段运行，系统地管理回调和 I/O 操作。

## 阶段顺序

libuv 事件循环按以下顺序运行这些阶段：

1. **定时器** - 执行由 `uv_timer_start()` 调度的回调
2. **待处理** - 执行从上一次迭代延迟的 I/O 回调
3. **空闲** - 执行空闲句柄（平台特定）
4. **准备** - 在轮询 I/O 之前执行准备句柄
5. **轮询** - 轮询新的 I/O 事件（kqueue/epoll 等）
6. **检查** - 轮询后立即执行检查句柄
7. **关闭** - 执行正在关闭的句柄的关闭回调
8. **引用** - 处理引用句柄以保持循环活动

## uv_run() 模式

```c
// 运行事件循环的三种模式
uv_run(uv_loop_t* loop, uv_run_mode mode);

typedef enum {
    UV_RUN_DEFAULT,  // 运行直到所有句柄完成
    UV_RUN_ONCE,     // 轮询一次 I/O，运行回调
    UV_RUN_NOWAIT    // 运行回调但不轮询 I/O
} uv_run_mode;
```

## 阶段详情

### 定时器阶段
- 定时器回调的排序优先级队列
- 执行所有截止日期已过的定时器
- `uv_timer_start()` / `uv_timer_stop()` / `uv_timer_again()`

### 轮询阶段
- 阻塞直到文件描述符可读/可写或超时
- 如果没有活动句柄，使用 UV_RUN_NOWAIT 行为
- 平台特定：epoll (Linux)、kqueue (macOS/BSD)、IOCP (Windows)

### 检查阶段
- 设计与轮询阶段配对
- 回调在这里在 I/O 轮询后立即运行
- 用于"I/O 之后立即"的工作

## 后端迭代

```c
// 内部循环结构（简化）
while (!loop->stop_flag) {
    uv__update_time(loop);        // 更新当前时间
    uv__run_timers(loop);          // 阶段 1
    uv__run_closing_handles(loop); // 阶段 7
    if (loop->stop_flag) break;
    
    // 轮询 I/O
    uv__io_poll(loop, timeout);
    
    // 处理立即回调
    uv__process_immediate(loop);
}
```

## 实际影响

- 定时器**不受**轮询阻塞影响
- 定时器顺序：定时器独立于其他阶段触发
- `uv_run(UV_RUN_NOWAIT)` 在轮询阶段从不阻塞
- 适当的句柄/引用管理保持循环活动
