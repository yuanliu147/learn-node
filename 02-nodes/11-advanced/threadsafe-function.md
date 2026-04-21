---
title: "ThreadsafeFunction in Node.js"
description: "Safely calling JavaScript callbacks from native threads using N-API ThreadsafeFunction"
tags:
  - nodejs
  - threads
  - threadsafe
  - native-addons
  - n-api
  - concurrency
related:
  - cpp-binding-napi
  - worker-threads
---

# ThreadsafeFunction in Node.js

When writing native addons with N-API, you often need to call JavaScript functions from background threads. **ThreadsafeFunction** (TSFN) provides a safe mechanism to do this, handling the复杂的 synchronization between native threads and V8's garbage collector.

## The Problem: Calling JS from Native Threads

```
┌─────────────────────────────────────────────────────────────────┐
│            Why ThreadsafeFunction is Needed                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Main Thread (V8 Engine)        Background Thread               │
│   ┌──────────────────┐          ┌──────────────────┐            │
│   │  JavaScript      │          │  C++ Work        │            │
│   │  Runtime         │          │  (libuv pool)    │            │
│   │                  │          │                  │            │
│   │  - GC active     │          │  - No GC access  │            │
│   │  - Handles valid │          │  - Handles invalid│            │
│   │  - Isolates sync │          │  - Isolate async │            │
│   └──────────────────┘          └──────────────────┘            │
│                                                                 │
│   Directly calling JS from background thread = CRASH            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Without TSFN, calling a JavaScript callback from a native thread causes:
- **Use-after-free**: V8 handles become invalid
- **Data races**: GC may run during the call
- **Crashes**: Invalid access to V8 internals

## ThreadsafeFunction Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 ThreadsafeFunction Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Native Thread                 Main Thread                     │
│        │                            │                           │
│        │  tsfn.BlockingCall()        │                           │
│        │  ───────────────────────►  │                           │
│        │                            │                           │
│        │     ┌──────────────────────┤                           │
│        │     │ Queue callback       │                           │
│        │     │ (refcount +1)        │                           │
│        │     └──────────────────────┤                           │
│        │                            │                           │
│        │     Wait for execution     │  Event Loop                │
│        │     (or timeout)          │  processes callback        │
│        │     ◄──────────────────────┤                           │
│        │                            │                           │
│        │     Return result          │                           │
│        │                            │                           │
└─────────────────────────────────────────────────────────────────┘
```

## Creating a ThreadsafeFunction

### Step 1: Define the Callback Type

```cpp
// Define the C++ callback signature
// This is the function that will be called from the main thread

// For a simple callback: void callback(Type value)
typedef void (*CallbackType)(napi_env, napi_value);

// For a callback with data: void callback(Type value, void* data)
typedef void (*CallbackWithDataType)(napi_env, napi_value, void*);
```

### Step 2: Create the ThreadsafeFunction

```cpp
#include <node_api.h>
#include <string>
#include <thread>
#include <atomic>

struct AddonData {
    napi_ref callback_ref;
    napi_async_context async_context;
    napi_threadsafe_function tsfn;
    std::atomic<bool> running;
};

// Function called when TSFN is released
void ThreadsafeFunctionEmptyCallback(napi_env env, void* data, void* hint) {
    // Cleanup when TSFN is destroyed
}

// Create TSFN
napi_value CreateThreadsafeFunction(
    napi_env env,
    napi_callback_info info
) {
    size_t argc = 1;
    napi_value callback_arg;
    napi_get_cb_info(env, info, &argc, &callback_arg, nullptr, nullptr);
    
    // Validate callback is a function
    bool is_function;
    napi_is_function(env, callback_arg, &is_function);
    if (!is_function) {
        napi_throw_type_error(env, nullptr, "Expected a function");
        return nullptr;
    }
    
    // Create a reference to keep the callback alive
    napi_ref ref;
    napi_create_reference(env, callback_arg, 1, &ref);
    
    // Create async context
    napi_async_context context;
    napi_create_async_context(env, nullptr, nullptr, nullptr, &context);
    
    // ThreadsafeFunction creation
    napi_threadsafe_function tsfn;
    napi_status status = napi_create_threadsafe_function(
        env,
        callback_arg,           // The JS function to call
        nullptr,                // Resource (async hook)
        nullptr,                // Resource name
        NAPI_MAX_PROMISE_WAIT_AMOUNT,  // Max wait in nanoseconds
        1,                      // Initial queue size (refcount)
        context,                // Async context
        ThreadsafeFunctionEmptyCallback,  // Finalize callback
        nullptr,                // Data for finalize callback
        &tsfn                   // Output: the threadsafe function
    );
    
    if (status != napi_ok) {
        // Handle error
    }
    
    // Store for later use
    // In real code, use napi_wrap to store in a persistent object
    
    napi_value result;
    napi_create_string_utf8(env, "TSFN created", NAPI_AUTO_LENGTH, &result);
    return result;
}
```

### Step 3: Call the ThreadsafeFunction

```cpp
// Data passed to the callback
struct CallbackData {
    int progress;
    int status;
};

// Function executed by background thread
void BackgroundTask(napi_threadsafe_function tsfn) {
    for (int i = 0; i <= 100; i += 10) {
        // Prepare callback data
        CallbackData* data = new CallbackData();
        data->progress = i;
        data->status = 0;
        
        // Non-blocking call - queues callback for main thread
        napi_status status = napi_call_threadsafe_function(
            tsfn,
            data,               // Data to pass to callback
            napi_tsfn_nonblocking  // Non-blocking (returns immediately)
        );
        
        if (status != napi_ok) {
            // Handle error (TSFN may be closing)
            break;
        }
        
        // Simulate work
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

// Alternative: Blocking call (waits for callback execution)
void BackgroundTaskBlocking(napi_threadsafe_function tsfn) {
    for (int i = 0; i <= 100; i += 10) {
        CallbackData* data = new CallbackData();
        data->progress = i;
        
        napi_status status = napi_call_threadsafe_function(
            tsfn,
            data,
            napi_tsfn_blocking  // Blocks until callback executes
        );
        
        if (status == napi_closing) {
            // TSFN is being destroyed, stop
            break;
        }
    }
}
```

## Handling the Callback in JavaScript

```cpp
// The C++ callback function (called on main thread)
void ProgressCallback(napi_env env, napi_value js_callback, void* context, void* data) {
    // data is what we passed in napi_call_threadsafe_function
    CallbackData* callback_data = static_cast<CallbackData*>(data);
    
    // Get the callback function
    napi_value callback = js_callback;
    
    // Create arguments for the JS callback
    napi_value progress_value;
    napi_create_int32(env, callback_data->progress, &progress_value);
    
    napi_value argv[1] = { progress_value };
    
    // Call the JavaScript function
    napi_value result;
    napi_call_function(
        env,
        env.Null(),    // 'this' context
        callback,
        1,             // Number of arguments
        argv,          // Arguments
        &result        // Return value
    );
    
    // Clean up our data
    delete callback_data;
}
```

## Complete Example: Progress Reporter

```cpp
// addon.cc - Full working example
#include <node_api.h>
#include <thread>
#include <atomic>

struct AddonData {
    napi_threadsafe_function tsfn;
    std::atomic<bool> running;
};

void CleanupCallback(napi_env env, void* data, void* hint) {
    // Called when TSFN is destroyed
}

void ProgressCallback(napi_env env, napi_value js_callback, void* context, void* data) {
    int* progress = static_cast<int*>(data);
    
    napi_value argv[1];
    napi_create_int32(env, *progress, &argv[0]);
    
    napi_value result;
    napi_call_function(env, env.Null(), js_callback, 1, argv, &result);
    
    delete progress;
}

void BackgroundThreadFunc(napi_threadsafe_function tsfn) {
    for (int i = 0; i <= 100; i += 10) {
        if (napi_call_threadsafe_function(
                tsfn,
                new int(i),
                napi_tsfn_nonblocking) != napi_ok) {
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

napi_value StartProgress(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value callback;
    napi_get_cb_info(env, info, &argc, &callback, nullptr, nullptr);
    
    // Validate
    bool is_function;
    napi_is_function(env, callback, &is_function);
    if (!is_function) {
        napi_throw_type_error(env, nullptr, "Expected a function");
        return nullptr;
    }
    
    // Create TSFN
    napi_threadsafe_function tsfn;
    napi_create_threadsafe_function(
        env,
        callback,
        nullptr,
        NAPI_MAX_PROMISE_WAIT_AMOUNT,
        1,
        nullptr,
        CleanupCallback,
        nullptr,
        &tsfn
    );
    
    // Launch background thread
    std::thread([tsfn]() {
        BackgroundThreadFunc(tsfn);
        napi_release_threadsafe_function(tsfn, napi_tsfn_release);
    }).detach();
    
    napi_create_string_utf8(env, "started", NAPI_AUTO_LENGTH, &tsfn);
    return tsfn;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor desc[] = {
        { "startProgress", nullptr, StartProgress, nullptr, nullptr, nullptr, napi_default, nullptr }
    };
    napi_define_properties(env, exports, 1, desc);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
```

```javascript
// index.js
const addon = require('./build/Release/my_addon.node');

addon.startProgress((progress) => {
    console.log(`Progress: ${progress}%`);
    if (progress === 100) {
        console.log('Complete!');
    }
});
```

## Reference Counting

ThreadsafeFunction uses reference counting to manage lifetime:

```
┌─────────────────────────────────────────────────────────────────┐
│                 TSFN Reference Counting                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  napi_create_threadsafe_function  → refcount = 1               │
│                                                                 │
│  napi_call_threadsafe_function    → refcount unchanged         │
│                                                                 │
│  napi_acquire_threadsafe_function → refcount++                 │
│  napi_release_threadsafe_function → refcount--                 │
│                                                                 │
│  When refcount reaches 0:                                      │
│    - No more calls can be made                                 │
│    - Finalize callback is called                               │
│    - TSFN is destroyed                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```cpp
// Acquiring (increase refcount)
// Use when passing TSFN to another thread
napi_acquire_threadsafe_function(tsfn);

// Releasing (decrease refcount)
// Use when thread finishes using TSFN
napi_release_threadsafe_function(tsfn, napi_tsfn_release);

// The background thread should call release when done
void BackgroundThreadFunc(napi_threadsafe_function tsfn) {
    // Do work...
    
    // Release our reference
    napi_release_threadsafe_function(tsfn, napi_tsfn_release);
}
```

## Comparison: Blocking vs Non-Blocking

| Mode | Behavior | Use Case |
|------|----------|----------|
| `napi_tsfn_nonblocking` | Returns immediately, callback queued | Fire-and-forget progress updates |
| `napi_tsfn_blocking` | Blocks until callback executes | Need confirmation of execution |
| `napi_tsfn_blocking` + full queue | Returns `napi_closing` | TSFN being destroyed |

```cpp
// Non-blocking: Fast, doesn't wait
napi_call_threadsafe_function(tsfn, data, napi_tsfn_nonblocking);
// Returns immediately
// Callback queued for event loop

// Blocking: Waits for execution
napi_status status = napi_call_threadsafe_function(tsfn, data, napi_tsfn_blocking);
// Blocks until:
// - Callback executes successfully
// - Timeout expires
// - TSFN is being destroyed (returns napi_closing)
```

## Error Handling

```cpp
napi_status status = napi_call_threadsafe_function(
    tsfn,
    data,
    napi_tsfn_nonblocking
);

switch (status) {
    case napi_ok:
        // Success, callback will be called
        break;
        
    case napi_queue_full:
        // Queue is full (reached max queue size)
        // Callback was NOT queued
        // Decide: wait, drop, or try again
        break;
        
    case napi_closing:
        // TSFN is in the process of being destroyed
        // Callback was NOT queued
        break;
        
    default:
        // Unexpected error
        break;
}
```

## Best Practices

### 1. Always Release in All Code Paths

```cpp
void BackgroundThread(napi_threadsafe_function tsfn) {
    // GOOD: Release in all paths
    do {
        // Work...
    } while (should_continue);
    
    // Always release when done
    napi_release_threadsafe_function(tsfn, napi_tsfn_release);
    
    // BAD: Don't forget to release!
}

void BackgroundThreadBad(napi_threadsafe_function tsfn) {
    if (error_condition) {
        return;  // LEAK: TSFN never released!
    }
    
    // Work...
    napi_release_threadsafe_function(tsfn, napi_tsfn_release);
}
```

### 2. Use Smart Pointers for Data

```cpp
// Instead of raw new/delete
void ProgressCallback(napi_env env, napi_value js_callback, void* context, void* data) {
    // data is owned by us, we must delete it
    std::unique_ptr<int> progress(static_cast<int*>(data));
    
    // Or use shared_ptr for shared ownership
    // std::shared_ptr<int> progress = 
    //     std::static_pointer_cast<int>(*(data));
    
    // ... use progress ...
}
```

### 3. Handle Queue Overflow

```cpp
// Limit queue size to prevent memory issues
napi_create_threadsafe_function(
    env,
    callback,
    nullptr,
    1000,  // max_queue_size (0 = unlimited, but can grow infinitely)
    1,
    context,
    finalize_cb,
    nullptr,
    &tsfn
);

// Monitor queue size
// If napi_call_threadsafe_function returns napi_queue_full,
// the queue has hit max_queue_size
```

### 4. Clean Shutdown

```cpp
// When shutting down the addon
napi_status status = napi_release_threadsafe_function(
    tsfn,
    napi_tsfn_release
);
// After this call:
// - No new calls will be queued
// - Existing queued calls will still execute
// - When refcount reaches 0, TSFN is destroyed

// Force immediate shutdown (call from main thread only)
status = napi_unref_threadsafe_function(env, tsfn);
// This drops refcount but doesn't wait
```

## Common Pitfalls

### 1. Using TSFN After Release

```cpp
// WRONG: Using TSFN after release
napi_release_threadsafe_function(tsfn, napi_tsfn_release);
// tsfn is now invalid!

napi_call_threadsafe_function(tsfn, data, napi_tsfn_nonblocking);
// Crash! Use-after-free

// CORRECT: Don't use after release
napi_release_threadsafe_function(tsfn, napi_tsfn_release);
tsfn = nullptr;  // Mark as invalid
```

### 2. Forgetting to Initialize

```cpp
// WRONG: Uninitialized TSFN
napi_threadsafe_function tsfn;  // Uninitialized!
napi_call_threadsafe_function(tsfn, data, napi_tsfn_nonblocking);
// Undefined behavior

// CORRECT: Always initialize
napi_threadsafe_function tsfn = nullptr;
if (condition) {
    napi_create_threadsafe_function(..., &tsfn);
}
```

### 3. Memory Leaks in Callback Data

```cpp
// WRONG: Leaking memory
void BackgroundThread(napi_threadsafe_function tsfn) {
    for (;;) {
        int* data = new int(42);  // Allocated
        napi_call_threadsafe_function(tsfn, data, napi_tsfn_nonblocking);
        // We never delete[] data!
        // ProgressCallback MUST delete it, but if callback never runs... leak!
    }
}

// CORRECT: Ensure cleanup happens
void ProgressCallback(napi_env env, napi_value cb, void* ctx, void* data) {
    delete static_cast<int*>(data);  // Always clean up
}
```

## Integration with Worker Threads

```javascript
// main.js - Using TSFN from Worker threads concept
const { Worker } = require('worker_threads');
const addon = require('./build/Release/my_addon.node');

// The native addon handles its own threading internally
// TSFN allows safe callback into this code
addon.startProgress((progress) => {
    console.log(`Worker progress: ${progress}%`);
});
```

## Key Takeaways

1. **ThreadsafeFunction is required** for calling JS from native threads
2. **Reference counting** controls lifetime - acquire/release properly
3. **Blocking vs non-blocking** - choose based on whether you need confirmation
4. **Queue management** - handle `napi_queue_full` appropriately
5. **Error handling** - check `napi_closing` status to detect shutdown
6. **Memory management** - always clean up data passed to callbacks

## References

- [N-API Threadsafe Function Docs](https://nodejs.org/api/n-api.html#n_api_napi_create_threadsafe_function)
- [node-addon-api ThreadsafeFunction](https://github.com/nodejs/node-addon-api/blob/main/doc/threadsafe_function.md)
- [libuv Thread Pool](https://docs.libuv.org/en/v1.x/threadpool.html)
