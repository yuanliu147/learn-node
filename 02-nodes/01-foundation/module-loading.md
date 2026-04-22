---
title: "Node.js 中的模块加载系统"
description: "深入了解 Node.js 如何使用 CommonJS 和 ES Modules 解析和加载模块"
tags:
  - Node.js
  - CommonJS
  - ES Modules
  - require
  - import
  - module resolution
  - bundling
topics:
  - nodejs-core
  - module-system
level: "intermediate"
updated: "2025-01-15"
---

# Node.js 中的模块加载系统

## 概述

Node.js 采用复杂的模块加载系统，处理两种主要的模块格式：**CommonJS (CJS)** 和 **ES Modules (ESM)**。理解模块如何被解析、缓存和加载对于构建高效且可维护的 Node.js 应用至关重要。

## CommonJS 模块系统

### `require()` 如何工作

CommonJS 模块系统是 Node.js 最初的模块格式。当你调用 `require('module-name')` 时，Node.js 执行多步解析过程：

```javascript
// 加载内置模块
const fs = require('fs');

// 加载文件模块（相对路径）
const myModule = require('./myModule');

// 从 node_modules 加载
const express = require('express');
```

### 模块解析算法

Node.js 对来自路径 Y 的模块使用 `require(X)` 的以下解析顺序：

1. **内置模块** - 检查 X 是否为 Node.js 内置（fs、path、http 等）
2. **文件模块** - 如果 X 以 `./` 或 `/` 或 `../` 开头
3. **node_modules** - 在 `node_modules` 目录中搜索

### 解析过程详解

```javascript
// 假设我们有：require('./utils/helper')
// Node.js 将尝试：

// 1. ./utils/helper.js
// 2. ./utils/helper.json
// 3. ./utils/helper.node（原生插件）
// 4. ./utils/helper/package.json（main 字段）
// 5. ./utils/helper/index.js
```

### 模块缓存

一旦模块被加载，它会被缓存在 `require.cache` 中。这意味着后续的 `require()` 调用返回相同的对象实例：

```javascript
const a = require('./module');
const b = require('./module');

console.log(a === b); // true - 相同的对象引用

// 清除缓存以重新加载
delete require.cache[require.resolve('./module')];
```

### `module` 对象

每个 CommonJS 文件都可以访问 `module` 对象：

```javascript
console.log(module.id);        // 此模块的唯一标识符
console.log(module.filename);  // 此文件的绝对路径
console.log(module.loaded);    // 模块是否已完成加载
console.log(module.children);  // 此模块 require 的模块
console.log(module.parent);    // require 此模块的模块

module.exports = { /* 你的导出 */ };
exports.helper = function() { /* 简写 */ };
```

## ES Modules (ESM)

### 在 Node.js 中使用 ESM

ES Modules 需要：
- 文件扩展名 `.mjs`
- `package.json` 中的 `"type": "module"`

```javascript
// 使用 .mjs 扩展名或 "type": "module"
import fs from 'fs';
import { readFile } from 'fs/promises';
import express from 'express';

// 默认导入
import React from 'react';

// 命名导入
import { Component } from 'react';

// 动态导入（同时适用于 CJS 和 ESM）
const module = await import('./module.js');
```

### 与 CommonJS 的关键区别

| 特性 | CommonJS | ES Modules |
|------|----------|------------|
| 语法 | `require()`, `module.exports` | `import`, `export` |
| 加载 | 同步 | 异步 |
| 解析 | 动态（运行时） | 静态（编译时） |
| 缓存 | `require.cache` 中的可变对象 | 不可变模块记录 |
| 提升 | 不适用 | 导入提升到顶部 |
| `this` | `module` 对象 | 顶层为 `undefined` |

### `import.meta`

ESM 提供 `import.meta`，包含当前模块的元数据：

```javascript
import.meta.url;        // 当前模块文件的 URL
import.meta.resolve();  // 解析模块说明符
import.meta.main;       // 是否作为主模块运行
```

## 模块解析算法

### Node.js 模块解析（CommonJS）

`require.resolve()` 算法遵循以下步骤：

```javascript
// 步骤 1：内置模块
// 'fs', 'path', 'http' - 直接返回

// 步骤 2：相对路径（./, ../, /）
// ./utils.js -> /path/to/project/utils.js
// ../utils.js -> /path/to/utils.js

// 步骤 3：node_modules 中的核心模块
// 从父目录开始向上遍历：
// /path/to/project/node_modules/module
// /path/to/node_modules/module
// /node_modules/module
```

### package.json 字段

Node.js 尊重多个用于模块解析的 `package.json` 字段：

```json
{
  "name": "my-package",
  "main": "dist/index.js",           // CommonJS 入口
  "module": "dist/index.mjs",        // ESM 入口（用于打包工具）
  "exports": {                       // 条件导出（Node.js 12+）
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./submodule": "./dist/sub.js"
  }
}
```

### `exports` 字段（条件导出）

条件导出允许基于导入方法的不同入口点：

```javascript
// package.json
{
  "exports": {
    ".": {
      "import": "./esm/index.js",
      "require": "./cjs/index.js"
    }
  }
}
```

## 高级模块模式

### 循环依赖

Node.js 处理循环依赖，但有注意事项：

```javascript
// a.js
const b = require('./b');
console.log('A: 已加载, b.value =', b.value);
module.exports = { value: 'A' };

// b.js
const a = require('./a');
console.log('B: 已加载, a.value =', a.value);
module.exports = { value: 'B' };

// main.js
require('./a');
// 输出：
// B: 已加载, a.value = undefined（a 尚未导出）
// A: 已加载, b.value = B
```

### 动态导入

动态 `import()` 返回 Promise，适用于：
- 代码分割
- 条件加载
- 基于运行时条件条件加载模块

```javascript
// 动态导入 ES 模块
const { default: express } = await import('express');

// 条件加载
if (process.env.FEATURE_FLAG) {
  const analytics = await import('./analytics.js');
  analytics.track();
}
```

### 原生模块插件

Node.js 可以加载原生插件（`.node` 文件）：

```javascript
// 内置原生插件
const binding = require('./build/Release/native addon.node');

// 使用 node-gyp 构建的模块
const myModule = require('my-native-module');
```

## 最佳实践

1. **使用命名导出以获得更好的 IDE 支持** - 命名导入提供更好的自动完成
2. **避免循环依赖** - 重组代码以防止循环引用
3. **在 package.json 中使用 `exports` 字段** - 比 `main` 更好地进行条件导出
4. **新包优先使用 ES Modules** - 但要考虑 Node.js 版本要求
5. **注意模块缓存** - 开发期间更改需要缓存失效

## 总结

Node.js 的模块加载系统为代码组织提供了强大而灵活的机制。理解 CommonJS 和 ES Modules 之间的区别、解析算法和缓存行为对于编写高效的 Node.js 应用和库至关重要。
