---
title: "C++ Addons with N-API"
description: "Building native Node.js addons using N-API (Node-API) for high-performance extensions and system-level integration"
tags:
  - nodejs
  - native-addons
  - n-api
  - cpp
  - ffi
related:
  - threadsafe-function
  - node-startup-flow
---

# C++ Addons with N-API

Native addons allow developers to write C/C++ code that integrates directly with Node.js, enabling:
- High-performance computational code
- Direct system-level access
- Reusing existing C/C++ libraries
- Building bindings to native APIs

**N-API** (Node-API) is the recommended API for building native addons, providing an ABI-stable interface that works across different Node.js versions.

## Why N-API Instead of Native Abstractions (nan)?

```
┌─────────────────────────────────────────────────────────────────┐
│                    N-API vs Legacy Addon APIs                   │
├──────────────────────┬──────────────────────────────────────────┤
│     NAN (nan.h)      │              N-API (node_api.h)          │
├──────────────────────┼──────────────────────────────────────────┤
│ Version-specific     │ ABI-stable across Node.js versions       │
│ Uses V8 APIs         │ Abstracted from V8 internals              │
│ Breaks on upgrades   │ Addon recompiles rarely needed            │
│ Complex lifecycle    │ Simplified memory management             │
│ Manual handle scope  │ Automatic garbage collection              │
└──────────────────────┴──────────────────────────────────────────┘
```

## Environment Setup

### Installation

```bash
# Install node-gyp (build tool for native addons)
npm install -g node-gyp

# Check installation
node-gyp --version
```

### package.json Configuration

```json
{
  "name": "my-native-addon",
  "version": "1.0.0",
  "main": "index.js",
  "gypfile": true,
  "scripts": {
    "install": "node-gyp rebuild",
    "build": "node-gyp build",
    "clean": "node-gyp clean"
  },
  "dependencies": {
    "node-addon-api": "^8.0.0"
  }
}
```

### binding.gyp Configuration

```python
{
  "targets": [
    {
      "target_name": "my_addon",
      "sources": [ "src/my_addon.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [ "<!(node -p \"require('node-addon-api').gyp\")" ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
    }
  ]
}
```

## Basic N-API Addon Structure

### Hello World Example

```cpp
// src/hello.cc
#include <node_api.h>
#include <string>

namespace demo {

// Helper for promise deferred
struct AddonData {
    napi_ref callback_ref;
    napi_async_context context;
    napi_env env;
};

// Cleanup callback for addon data
void DeleteAddonData(napi_env env, void* data) {
    // Free any allocated resources
}

// Echo function - demonstrates basic napi_call_function
napi_value Echo(napi_env env, napi_callback_info info) {
    napi_status status;
    
    // Get the argument count and arguments
    size_t argc = 1;
    napi_value args[1];
    status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (status != napi_ok) return nullptr;
    
    // Just return the first argument unchanged
    return args[0];
}

// Add function - demonstrates number operations
napi_value Add(napi_env env, napi_callback_info info) {
    napi_status status;
    
    size_t argc = 2;
    napi_value args[2];
    status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (status != napi_ok) return nullptr;
    
    double value0, value1;
    status = napi_get_value_double(env, args[0], &value0);
    if (status != napi_ok) return nullptr;
    
    status = napi_get_value_double(env, args[1], &value1);
    if (status != napi_ok) return nullptr;
    
    napi_value result;
    status = napi_create_double(env, value0 + value1, &result);
    if (status != napi_ok) return nullptr;
    
    return result;
}

// Initialize the addon
napi_value Init(napi_env env, napi_value exports) {
    napi_status status;
    
    // Define the addon methods
    napi_property_descriptor desc[] = {
        { "echo", nullptr, Echo, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "add", nullptr, Add, nullptr, nullptr, nullptr, napi_default, nullptr }
    };
    
    status = napi_define_properties(env, exports, 2, desc);
    if (status != napi_ok) return nullptr;
    
    return exports;
}

}  // namespace demo

// Register the addon
NAPI_MODULE(NODE_GYP_MODULE_NAME, demo::Init)
```

### Building and Using the Addon

```bash
# Build the addon
npm run build

# This creates:
# - build/Release/my_addon.node (on success)
# - build/Debug/my_addon.node (with --debug flag)
```

```javascript
// index.js
const addon = require('./build/Release/my_addon.node');

console.log(addon.echo('hello'));        // 'hello'
console.log(addon.echo(42));             // 42
console.log(addon.add(10, 20));          // 30
console.log(addon.add(1.5, 2.5));        // 4
```

## Working with Objects

### Creating JavaScript Objects

```cpp
// Create an object with properties
napi_value CreateObject(napi_env env, napi_callback_info info) {
    napi_status status;
    
    // Create a new empty object
    napi_value obj;
    status = napi_create_object(env, &obj);
    if (status != napi_ok) return nullptr;
    
    // Create property: { name: "value" }
    napi_value name_value;
    status = napi_create_string_utf8(env, "value", NAPI_AUTO_LENGTH, &name_value);
    
    napi_property_descriptor props[] = {
        { "name", nullptr, nullptr, nullptr, nullptr, name_value, napi_default, nullptr },
        { "version", nullptr, nullptr, nullptr, nullptr, nullptr, napi_default, nullptr }
    };
    
    status = napi_define_properties(env, obj, 1, props);
    
    // Set version property separately
    napi_value version;
    status = napi_create_int32(env, 1, &version);
    status = napi_set_named_property(env, obj, "version", version);
    
    return obj;
}
```

### Accessing Object Properties

```cpp
napi_value GetObjectProperty(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value obj_arg;
    napi_get_cb_info(env, info, &argc, &obj_arg, nullptr, nullptr);
    
    // Get named property
    napi_value name_value;
    napi_status status = napi_get_named_property(env, obj_arg, "name", &name_value);
    
    // Get property by key
    napi_value key;
    napi_create_string_utf8(env, "name", NAPI_AUTO_LENGTH, &key);
    napi_value value;
    status = napi_get_property(env, obj_arg, key, &value);
    
    return value;
}
```

## Working with Arrays

```cpp
// Create array: [1, 2, 3]
napi_value CreateArray(napi_env env, napi_callback_info info) {
    napi_status status;
    
    napi_value array;
    status = napi_create_array_with_length(env, 3, &array);
    
    for (int i = 0; i < 3; i++) {
        napi_value element;
        status = napi_create_int32(env, i + 1, &element);
        status = napi_set_element(env, array, i, element);
    }
    
    return array;
}

// Get array length and elements
napi_value SumArray(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value array_arg;
    napi_get_cb_info(env, info, &argc, &array_arg, nullptr, nullptr);
    
    uint32_t length;
    napi_get_array_length(env, array_arg, &length);
    
    int64_t sum = 0;
    for (uint32_t i = 0; i < length; i++) {
        napi_value element;
        napi_get_element(env, array_arg, i, &element);
        
        int32_t value;
        napi_get_value_int32(env, element, &value);
        sum += value;
    }
    
    napi_value result;
    napi_create_int64(env, sum, &result);
    return result;
}
```

## Promises and Async Operations

### Promises with Deferred

```cpp
// Async work structure
struct AsyncWorkData {
    napi_deferred deferred;
    napi_async_work work;
    int32_t input_value;
    int32_t result_value;
};

// Execute callback (runs in background thread)
void ExecuteWork(napi_env env, void* data) {
    AsyncWorkData* work_data = static_cast<AsyncWorkData*>(data);
    
    // Simulate expensive computation
    // In real code, this runs in libuv thread pool
    work_data->result_value = work_data->input_value * 2;
}

// Complete callback (runs when work is done)
void CompleteWork(napi_env env, napi_status status, void* data) {
    AsyncWorkData* work_data = static_cast<AsyncWorkData*>(data);
    
    napi_value result;
    napi_create_int32(env, work_data->result_value, &result);
    
    // Resolve the promise
    napi_resolve_deferred(env, work_data->deferred, result);
    
    // Clean up
    napi_delete_async_work(env, work_data->work);
    delete work_data;
}

// Promise-returning function
napi_value DoublePromise(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    
    int32_t input_value;
    napi_get_value_int32(env, args[0], &input_value);
    
    // Create promise and deferred
    napi_value promise;
    napi_deferred deferred;
    napi_create_promise(env, &deferred, &promise);
    
    // Create async work
    AsyncWorkData* work_data = new AsyncWorkData();
    work_data->input_value = input_value;
    work_data->deferred = deferred;
    
    napi_async_work work;
    napi_create_async_work(
        env,
        nullptr,                    // async resource
        nullptr,                    // resource name
        ExecuteWork,
        CompleteWork,
        work_data,
        &work
    );
    
    work_data->work = work;
    napi_queue_async_work(env, work);
    
    return promise;
}
```

### Using Promises from JavaScript

```javascript
const addon = require('./build/Release/my_addon.node');

async function test() {
    const result = await addon.doublePromise(21);
    console.log(result);  // 42
}

test().catch(console.error);
```

## Error Handling

### Creating and Throwing Errors

```cpp
napi_value MaybeThrow(napi_env env, napi_callback_info info) {
    napi_status status;
    
    // Check some condition
    bool has_error = true;
    
    if (has_error) {
        // Create error object
        napi_value error_msg;
        napi_create_string_utf8(
            env,
            "Something went wrong!",
            NAPI_AUTO_LENGTH,
            &error_msg
        );
        
        // Create TypeError
        napi_value error;
        napi_create_type_error(env, nullptr, error_msg, &error);
        
        // Throw the error
        napi_throw(env, error);
        return nullptr;
    }
    
    // Return normally
    napi_value result;
    napi_create_string_utf8(env, "OK", NAPI_AUTO_LENGTH, &result);
    return result;
}

// Error with custom code
napi_value CustomError(napi_env env, napi_callback_info info) {
    napi_value error;
    napi_create_error(
        env,
        nullptr,  // no error code
        nullptr,  // no message (use js message)
        &error
    );
    
    // Set error code
    napi_value code;
    napi_create_string_utf8(env, "CUSTOM_ERROR", NAPI_AUTO_LENGTH, &code);
    napi_set_named_property(env, error, "code", code);
    
    napi_throw(env, error);
    return nullptr;
}
```

### Handling Errors from JavaScript

```javascript
try {
    addon.maybeThrow();
} catch (e) {
    console.log(e.message);  // "Something went wrong!"
    console.log(e.name);      // "TypeError"
}
```

## Memory Management

### Reference Counting

```cpp
// Persistent references keep objects alive
struct PersistentData {
    napi_ref ref;       // Persistent reference to object
    int32_t value;
};

napi_value CreatePersistent(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value obj_arg;
    napi_get_cb_info(env, info, &argc, &obj_arg, nullptr, nullptr);
    
    // Create a reference (initial ref count = 1)
    napi_ref ref;
    napi_create_reference(env, obj_arg, 1, &ref);
    
    // The object won't be garbage collected
    // until we delete the reference
    
    return nullptr;
}

napi_value FreePersistent(napi_env env, napi_callback_info info) {
    // Assuming we stored ref somewhere accessible
    // napi_delete_reference(env, ref);
    
    return nullptr;
}
```

### Scope Management

```cpp
// For older N-API versions, manual handle scopes were needed
// N-API 8+ uses automatic garbage collection

napi_value ExampleScope(napi_env env, napi_callback_info info) {
    // No need for explicit HandleScope in modern N-API
    // V8 handlescope is managed automatically
    
    napi_value result;
    napi_create_string_utf8(env, "automatic memory", NAPI_AUTO_LENGTH, &result);
    return result;
}
```

## Async Callbacks

### Safe Callbacks to JavaScript

```cpp
// Thread-safe callback structure
struct ThreadsafeData {
    napi_ref callback_ref;  // Reference to JS function
    napi_async_context context;
    std::atomic<bool> running;
};

void ThreadsafeCallback(void* data) {
    ThreadsafeData* ts_data = static_cast<ThreadsafeData*>(data);
    
    napi_env env = ts_data->context.env;
    
    // Get the callback function
    napi_value callback;
    napi_get_reference_value(env, ts_data->callback_ref, &callback);
    
    // Call the callback
    napi_value result;
    napi_value undefined;
    napi_get_undefined(env, &undefined);
    
    napi_call_function(
        env,
        undefined,    // 'this' context
        callback,
        0,            // argc
        nullptr,      // argv
        &result       // return value
    );
}

// JavaScript side:
function onProgress(progress) {
    console.log(`Progress: ${progress}%`);
}

// This is unsafe without ThreadsafeFunction (see threadsafe-function.md)
```

## Best Practices

### 1. Use node-addon-api Header-Only Library

```cpp
// Instead of raw N-API, use the C++ wrapper
#include <node_api.h>
#include <napi.h>

// Much cleaner C++ API
Napi::Number Add(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2 arguments")
            .ThrowAsJavaScriptException();
        return Napi::Value();
    }
    double a = info[0].As<Napi::Number>().DoubleValue();
    double b = info[1].As<Napi::Number>().DoubleValue();
    return Napi::Number::New(env, a + b);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "add"),
                Napi::Function::New(env, Add));
    return exports;
}

NODE_API_MODULE(addon, Init)
```

### 2. Always Check Return Status

```cpp
// BAD: Ignoring return status
napi_value BadFunction(napi_env env, napi_callback_info info) {
    napi_value result;
    napi_create_int32(env, 42, &result);  // Ignores status!
    return result;
}

// GOOD: Check every call
napi_value GoodFunction(napi_env env, napi_callback_info info) {
    napi_status status;
    napi_value result;
    
    status = napi_create_int32(env, 42, &result);
    if (status != napi_ok) {
        napi_throw_error(env, "CREATE_ERROR", "Failed to create number");
        return nullptr;
    }
    
    return result;
}
```

### 3. Clean Up Resources

```cpp
// AddonData cleanup on module unload
void Cleanup(void* data) {
    AddonData* addon_data = static_cast<AddonData*>(data);
    
    if (addon_data->callback_ref != nullptr) {
        napi_delete_reference(env, addon_data->callback_ref);
    }
    
    delete addon_data;
}

napi_value Init(napi_env env, napi_value exports) {
    AddonData* data = new AddonData();
    data->callback_ref = nullptr;
    
    napi_wrap(
        env,
        exports,
        data,
        Cleanup,
        nullptr,
        nullptr
    );
    
    return exports;
}
```

## Key Takeaways

1. **N-API provides ABI stability**: Addons compiled for one Node.js version generally work on others
2. **node-addon-api simplifies C++ usage**: Header-only library provides cleaner API
3. **Promises are first-class**: Use `napi_create_promise` and `napi_deferred`
4. **Error handling is explicit**: Always check `napi_status` return values
5. **Garbage collection is automatic**: N-API manages JS object lifetimes
6. **Async work uses libuv**: `napi_create_async_work` queues work in the thread pool

## References

- [N-API Documentation](https://nodejs.org/api/n-api.html)
- [node-addon-api GitHub](https://github.com/nodejs/node-addon-api)
- [node-gyp Documentation](https://github.com/nodejs/node-gyp)
- [Writing Native Addons Guide](https://nodejs.org/api/addons.html)
