# C++ Addons 与 N-API

原生模块允许开发者编写直接与 Node.js 集成的 C/C++ 代码，实现以下功能：

- 高性能计算代码
- 直接的系统级访问
- 复用现有 C/C++ 库
- 构建原生 API 绑定

**N-API**（Node-API）是构建原生模块的推荐 API，提供了跨不同 Node.js 版本的 ABI 稳定接口。

## 为什么选 N-API 而不是 NAN？

```
┌─────────────────────────────────────────────────────────────────┐
│                    N-API vs 传统 Addon API                       │
├──────────────────────┬──────────────────────────────────────────┤
│     NAN (nan.h)      │              N-API (node_api.h)          │
├──────────────────────┼──────────────────────────────────────────┤
│ 版本特定             │ 跨 Node.js 版本 ABI 稳定                   │
│ 使用 V8 API          │ 抽象了 V8 内部实现                        │
│ 升级时会断裂         │ 很少需要重新编译 addon                     │
│ 生命周期复杂         │ 简化了内存管理                            │
│ 手动管理 handle scope │ 自动垃圾回收                              │
└──────────────────────┴──────────────────────────────────────────┘
```

## 环境配置

### 安装

```bash
# 安装 node-gyp（原生模块构建工具）
npm install -g node-gyp

# 验证安装
node-gyp --version
```

### package.json 配置

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

### binding.gyp 配置

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

## 基础 N-API 模块结构

### Hello World 示例

```cpp
// src/hello.cc
#include <node_api.h>
#include <string>

namespace demo {

// Promise deferred 的辅助结构
struct AddonData {
    napi_ref callback_ref;
    napi_async_context context;
    napi_env env;
};

// 模块数据清理回调
void DeleteAddonData(napi_env env, void* data) {
    // 释放任何已分配的资源
}

// Echo 函数 - 演示基本的 napi_call_function
napi_value Echo(napi_env env, napi_callback_info info) {
    napi_status status;
    
    // 获取参数数量和参数
    size_t argc = 1;
    napi_value args[1];
    status = napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (status != napi_ok) return nullptr;
    
    // 直接返回第一个参数
    return args[0];
}

// Add 函数 - 演示数值操作
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

// 初始化模块
napi_value Init(napi_env env, napi_value exports) {
    napi_status status;
    
    // 定义模块方法
    napi_property_descriptor desc[] = {
        { "echo", nullptr, Echo, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "add", nullptr, Add, nullptr, nullptr, nullptr, napi_default, nullptr }
    };
    
    status = napi_define_properties(env, exports, 2, desc);
    if (status != napi_ok) return nullptr;
    
    return exports;
}

}  // namespace demo

// 注册模块
NAPI_MODULE(NODE_GYP_MODULE_NAME, demo::Init)
```

### 构建和使用模块

```bash
# 构建模块
npm run build

# 成功后会创建：
# - build/Release/my_addon.node（成功时）
# - build/Debug/my_addon.node（带 --debug 标志时）
```

```javascript
// index.js
const addon = require('./build/Release/my_addon.node');

console.log(addon.echo('hello'));        // 'hello'
console.log(addon.echo(42));             // 42
console.log(addon.add(10, 20));         // 30
console.log(addon.add(1.5, 2.5));       // 4
```

## 操作对象

### 创建 JavaScript 对象

```cpp
// 创建带属性的对象
napi_value CreateObject(napi_env env, napi_callback_info info) {
    napi_status status;
    
    // 创建一个新的空对象
    napi_value obj;
    status = napi_create_object(env, &obj);
    if (status != napi_ok) return nullptr;
    
    // 创建属性：{ name: "value" }
    napi_value name_value;
    status = napi_create_string_utf8(env, "value", NAPI_AUTO_LENGTH, &name_value);
    
    napi_property_descriptor props[] = {
        { "name", nullptr, nullptr, nullptr, nullptr, name_value, napi_default, nullptr },
        { "version", nullptr, nullptr, nullptr, nullptr, nullptr, napi_default, nullptr }
    };
    
    status = napi_define_properties(env, obj, 1, props);
    
    // 单独设置 version 属性
    napi_value version;
    status = napi_create_int32(env, 1, &version);
    status = napi_set_named_property(env, obj, "version", version);
    
    return obj;
}
```

### 访问对象属性

```cpp
napi_value GetObjectProperty(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value obj_arg;
    napi_get_cb_info(env, info, &argc, &obj_arg, nullptr, nullptr);
    
    // 获取命名属性
    napi_value name_value;
    napi_status status = napi_get_named_property(env, obj_arg, "name", &name_value);
    
    // 通过 key 获取属性
    napi_value key;
    napi_create_string_utf8(env, "name", NAPI_AUTO_LENGTH, &key);
    napi_value value;
    status = napi_get_property(env, obj_arg, key, &value);
    
    return value;
}
```

## 操作数组

```cpp
// 创建数组：[1, 2, 3]
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

// 获取数组长度和元素
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

## Promise 与异步操作

### 带 Deferred 的 Promise

```cpp
// 异步工作结构
struct AsyncWorkData {
    napi_deferred deferred;
    napi_async_work work;
    int32_t input_value;
    int32_t result_value;
};

// 执行回调（在后台线程运行）
void ExecuteWork(napi_env env, void* data) {
    AsyncWorkData* work_data = static_cast<AsyncWorkData*>(data);
    
    // 模拟昂贵计算
    // 实际代码中，这运行在 libuv 线程池
    work_data->result_value = work_data->input_value * 2;
}

// 完成回调（工作完成时运行）
void CompleteWork(napi_env env, napi_status status, void* data) {
    AsyncWorkData* work_data = static_cast<AsyncWorkData*>(data);
    
    napi_value result;
    napi_create_int32(env, work_data->result_value, &result);
    
    // Resolve the promise
    napi_resolve_deferred(env, work_data->deferred, result);
    
    // 清理
    napi_delete_async_work(env, work_data->work);
    delete work_data;
}

// 返回 Promise 的函数
napi_value DoublePromise(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    
    int32_t input_value;
    napi_get_value_int32(env, args[0], &input_value);
    
    // 创建 promise 和 deferred
    napi_value promise;
    napi_deferred deferred;
    napi_create_promise(env, &deferred, &promise);
    
    // 创建异步工作
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

### JavaScript 端使用 Promise

```javascript
const addon = require('./build/Release/my_addon.node');

async function test() {
    const result = await addon.doublePromise(21);
    console.log(result);  // 42
}

test().catch(console.error);
```

## 错误处理

### 创建和抛出错误

```cpp
napi_value MaybeThrow(napi_env env, napi_callback_info info) {
    napi_status status;
    
    // 检查某个条件
    bool has_error = true;
    
    if (has_error) {
        // 创建错误对象
        napi_value error_msg;
        napi_create_string_utf8(
            env,
            "Something went wrong!",
            NAPI_AUTO_LENGTH,
            &error_msg
        );
        
        // 创建 TypeError
        napi_value error;
        napi_create_type_error(env, nullptr, error_msg, &error);
        
        // 抛出错误
        napi_throw(env, error);
        return nullptr;
    }
    
    // 正常返回
    napi_value result;
    napi_create_string_utf8(env, "OK", NAPI_AUTO_LENGTH, &result);
    return result;
}

// 带自定义错误码的错误
napi_value CustomError(napi_env env, napi_callback_info info) {
    napi_value error;
    napi_create_error(
        env,
        nullptr,  // no error code
        nullptr,  // no message (use js message)
        &error
    );
    
    // 设置错误码
    napi_value code;
    napi_create_string_utf8(env, "CUSTOM_ERROR", NAPI_AUTO_LENGTH, &code);
    napi_set_named_property(env, error, "code", code);
    
    napi_throw(env, error);
    return nullptr;
}
```

### JavaScript 端处理错误

```javascript
try {
    addon.maybeThrow();
} catch (e) {
    console.log(e.message);  // "Something went wrong!"
    console.log(e.name);      // "TypeError"
}
```

## 内存管理

### 引用计数

```cpp
// 持久引用保持对象存活
struct PersistentData {
    napi_ref ref;       // 对象的持久引用
    int32_t value;
};

napi_value CreatePersistent(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value obj_arg;
    napi_get_cb_info(env, info, &argc, &obj_arg, nullptr, nullptr);
    
    // 创建引用（初始引用计数 = 1）
    napi_ref ref;
    napi_create_reference(env, obj_arg, 1, &ref);
    
    // 在删除引用之前，对象不会被垃圾回收
    
    return nullptr;
}

napi_value FreePersistent(napi_env env, napi_callback_info info) {
    // 假设我们将 ref 存储在某个可访问的地方
    // napi_delete_reference(env, ref);
    
    return nullptr;
}
```

### 作用域管理

```cpp
// 对于旧版 N-API，需要手动 handle scopes
// N-API 8+ 使用自动垃圾回收

napi_value ExampleScope(napi_env env, napi_callback_info info) {
    // 现代 N-API 不需要显式 HandleScope
    // V8 handlescope 由系统自动管理
    
    napi_value result;
    napi_create_string_utf8(env, "automatic memory", NAPI_AUTO_LENGTH, &result);
    return result;
}
```

## 异步回调

### 安全回调到 JavaScript

```cpp
// 线程安全回调结构
struct ThreadsafeData {
    napi_ref callback_ref;  // JS 函数的引用
    napi_async_context context;
    std::atomic<bool> running;
};

void ThreadsafeCallback(void* data) {
    ThreadsafeData* ts_data = static_cast<ThreadsafeData*>(data);
    
    napi_env env = ts_data->context.env;
    
    // 获取回调函数
    napi_value callback;
    napi_get_reference_value(env, ts_data->callback_ref, &callback);
    
    // 调用回调
    napi_value result;
    napi_value undefined;
    napi_get_undefined(env, &undefined);
    
    napi_call_function(
        env,
        undefined,    // 'this' 上下文
        callback,
        0,            // argc
        nullptr,      // argv
        &result       // 返回值
    );
}

// JavaScript 端：
function onProgress(progress) {
    console.log(`Progress: ${progress}%`);
}

// 注意：没有 ThreadsafeFunction 是不安全的（见 threadsafe-function.md）
```

## 最佳实践

### 1. 使用 node-addon-api 头文件库

```cpp
// 使用 C++ 包装器而不是原始 N-API
#include <node_api.h>
#include <napi.h>

// 更简洁的 C++ API
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

### 2. 始终检查返回状态

```cpp
// 错误：忽略返回状态
napi_value BadFunction(napi_env env, napi_callback_info info) {
    napi_value result;
    napi_create_int32(env, 42, &result);  // 忽略了状态！
    return result;
}

// 正确：检查每次调用
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

### 3. 清理资源

```cpp
// 模块卸载时的 AddonData 清理
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

## 关键要点

1. **N-API 提供 ABI 稳定性**：为一个 Node.js 版本编译的 addon 通常可以在其他版本上运行
2. **node-addon-api 简化 C++ 使用**：头文件库提供更清晰的 API
3. **Promise 是一等公民**：使用 `napi_create_promise` 和 `napi_deferred`
4. **错误处理是显式的**：始终检查 `napi_status` 返回值
5. **垃圾回收是自动的**：N-API 管理 JS 对象生命周期
6. **异步工作使用 libuv**：`napi_create_async_work` 将工作排队到线程池

## 参考

- [N-API 文档](https://nodejs.org/api/n-api.html)
- [node-addon-api GitHub](https://github.com/nodejs/node-addon-api)
- [node-gyp 文档](https://github.com/nodejs/node-gyp)
- [编写原生模块指南](https://nodejs.org/api/addons.html)
