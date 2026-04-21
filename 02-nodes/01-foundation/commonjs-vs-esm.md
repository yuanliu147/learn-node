---
id: commonjs-vs-esm
title: CommonJS vs ES Modules (ESM) 技术选型
difficulty: L2
tags: ["nodejs", "modules", "commonjs", "esm", "import", "export", "module-system"]
prerequisites: ["event-loop-phases"]
related: ["microtask-macrotask", "module-loading"]
interview_hot: true
ai_confidence: 5
version: 2.0
last_updated: 2026-04-21
human_verified: false
todo:
  - 添加 ESM import assertion vs import attributes 对比
  - 补充 CJS 和 ESM 混用的边界情况
---

# CommonJS vs ES Modules (ESM) 技术选型

## 一句话定义

> CommonJS (CJS) 是 Node.js 传统的同步模块系统，而 ES Modules (ESM) 是 ES2015+ 标准的静态异步模块系统。两者在语法、加载时机、缓存行为上存在本质差异，选择时需要考虑项目规模、生态兼容性和性能需求。

---

## 解决什么问题

### 模块系统的核心问题：代码复用与依赖管理

```
没有模块系统的问题：
┌─────────────────────────────────────────────────────┐
│  全局变量污染          依赖关系混乱                 │
│  ┌─────────────┐      ┌─────────────┐            │
│  │  var a = 1  │      │  文件1用a    │            │
│  │  var a = 2  │  →   │  文件2改a    │  → 难以维护 │
│  │  console.log│      │  文件3不知用哪个a           │
│  └─────────────┘      └─────────────┘            │
└─────────────────────────────────────────────────────┘

模块系统解决的问题：
┌─────────────────────────────────────────────────────┐
│  模块作用域隔离        显式依赖声明                 │
│  ┌─────────────┐      ┌─────────────┐            │
│  │ module a    │      │ require('./b')│           │
│  │  export = 1 │  →   │  清晰的依赖  │  → 可维护   │
│  │  export = 2 │      │  树          │            │
│  └─────────────┘      └─────────────┘            │
└─────────────────────────────────────────────────────┘
```

---

## 架构设计

### 核心机制对比

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         模块加载架构对比                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   CommonJS (CJS)                     ES Modules (ESM)                    │
│   ===============                    ===============                    │
│                                                                          │
│   require() ──→ 同步读取              import ──→ 静态分析                │
│       │                                │                                │
│       ▼                                ▼                                │
│   ┌────────┐                      ┌────────────┐                        │
│   │ 运行时  │                      │  解析时    │                        │
│   │ 执行    │                      │ 构建依赖图  │                        │
│   └────────┘                      └────────────┘                        │
│       │                                │                                │
│       ▼                                ▼                                │
│   module.exports                 export {} 声明                         │
│   (对象拷贝)                      (实时绑定)                            │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  关键差异:                                                               │
│  • CJS: 动态、运行时、同步、值拷贝                                       │
│  • ESM: 静态、解析时、异步(加载)、引用绑定                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 加载流程对比

```
CJS 加载流程:
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ require()│────▶│  解析    │────▶│  加载    │────▶│  执行    │
│  调用    │     │ (运行时) │     │ (同步)   │     │ (同步)   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                              │
                                              ▼
                                        ┌──────────┐
                                        │  缓存    │
                                        │ (exports)│
                                        └──────────┘

ESM 加载流程:
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  import  │────▶│  解析    │────▶│  构建    │────▶│  实例化  │
│  声明    │     │ (静态)   │     │ 依赖图   │     │ (异步)   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              ┌──────────┐              ┌──────────┐              ┌──────────┐
              │ Module A │              │ Module B │              │ Module C │
              │ (已实例化)│              │ (实例化中)│              │ (等待中)  │
              └──────────┘              └──────────┘              └──────────┘
```

---

## 技术选型视角

### 选择 CJS 的场景

| 场景 | 原因 | 示例 |
|------|------|------|
| **Node.js 工具脚本** | 简单、无需构建工具 | CLI 工具、构建脚本 |
| **内部项目快速原型** | 无需配置，开箱即用 | 快速验证想法 |
| **大量使用动态 require** | ESM 不支持 `require()` | 插件系统、条件加载 |
| **需要同步加载** | ESM 本质是异步 | 同步初始化的库 |
| **遗留代码维护** | 避免大规模重构 | 长期维护的项目 |

### 选择 ESM 的场景

| 场景 | 原因 | 示例 |
|------|------|------|
| **前端框架开发** | 更好的 tree-shaking | React、Vue 组件库 |
| **需要静态分析** | 导入可被分析 | bundler、linter |
| **现代 Node.js 项目** | v20+ 默认支持 | 新项目、活跃维护项目 |
| **需要顶级 await** | 只有 ESM 支持 | 初始化逻辑复杂的模块 |
| **跨环境代码** | 浏览器原生支持 | 同构代码库 |
| **发布 npm 包** | 趋势是 ESM-first | 现代库 |

### 决策矩阵

```
                    CJS                              ESM
                   ┌───────┐                       ┌───────┐
    同步加载       │  ✅   │                       │  ❌   │
                   └───────┘                       └───────┘
                   ┌───────┐                       ┌───────┐
    动态 require   │  ✅   │                       │  ❌   │
                   └───────┘                       └───────┘
                   ┌───────┐                       ┌───────┐
    Tree-shaking   │  ❌   │                       │  ✅   │
                   └───────┘                       └───────┘
                   ┌───────┐                       ┌───────┐
    静态分析       │  ❌   │                       │  ✅   │
                   └───────┘                       └───────┘
                   ┌───────┐                       ┌───────┐
    浏览器原生     │  ❌   │                       │  ✅   │
                   └───────┘                       └───────┘
                   ┌───────┐                       ┌───────┐
    顶级 await     │  ❌   │                       │  ✅   │
                   └───────┘                       └───────┘
```

### 迁移策略：CJS → ESM

```
迁移路径选择:

1. 增量迁移 (推荐)
   ┌─────────────────────────────────────────────────────┐
   │  .mjs 文件直接使用 ESM                              │
   │  .js 文件保持 CJS                                   │
   │  通过动态 import() 混用                             │
   └─────────────────────────────────────────────────────┘

2. 全面迁移
   ┌─────────────────────────────────────────────────────┐
   │  package.json: { "type": "module" }                 │
   │  所有 .js → .mjs 或重构 import/export               │
   │  风险较高，需要全面测试                              │
   └─────────────────────────────────────────────────────┘

3. 双模式发布 (库)
   ┌─────────────────────────────────────────────────────┐
   │  package.json:                                      │
   │  {                                                  │
   │    "type": "module",                                │
   │    "exports": {                                     │
   │      "import": "./dist/esm/index.js",               │
   │      "require": "./dist/cjs/index.cjs"              │
   │    }                                                │
   │  }                                                  │
   └─────────────────────────────────────────────────────┘
```

### 混用注意事项

```javascript
// ❌ 错误: 在 ESM 中使用 require
// my-module.mjs
const cjs = require('./cjs-module');  // SyntaxError!

// ✅ 正确: 动态 import()
const cjs = await import('./cjs-module.cjs');

// ❌ 错误: 在 CJS 中使用静态 import
// my-module.cjs
import { foo } from './esm-module';  // SyntaxError!

// ✅ 正确: 动态 import()
import('./esm-module.mjs').then(module => {
  console.log(module.foo);
});
```

### 循环依赖处理对比

```javascript
// CJS: 返回部分初始化的 module.exports
// a.js
console.log('a starting');
const b = require('./b');
console.log('a: b.loaded =', b.loaded);
module.exports = { loaded: true };

// b.js
console.log('b starting');
const a = require('./a');
console.log('b: a.loaded =', a.loaded);  // undefined!
module.exports = { loaded: true };

// 输出:
// a starting
// b starting
// b: a.loaded = undefined  ← a 尚未完成初始化
// a: b.loaded = true

// ESM: 通过 binding 延迟求值
// a.mjs
console.log('a starting');
import { b } from './b.mjs';
console.log('a: b =', b);
export const a = 'module a';

export function getB() { return b; }

// b.mjs
console.log('b starting');
import { a } from './a.mjs';
console.log('b: a =', a);  // 'module a' — binding 已建立
export const b = 'module b';
```

---

## 实战对比

### CJS 示例

```javascript
// math.js
const add = (a, b) => a + b;
const multiply = (a, b) => a * b;

// 导出方式1: 直接赋值
module.exports = { add, multiply };

// 导出方式2: 逐个赋值
// module.exports.add = add;
// module.exports.multiply = multiply;

// main.js
const { add, multiply } = require('./math');

console.log(add(2, 3));       // 5
console.log(multiply(4, 5));  // 20
```

### ESM 示例

```javascript
// math.mjs
export const add = (a, b) => a + b;
export const multiply = (a, b) => a * b;

// 默认导出
export default class Calculator { }

// main.mjs
import Calc, { add, multiply } from './math.mjs';

console.log(add(2, 3));       // 5
console.log(multiply(4, 5));  // 20
```

### 互操作示例

```javascript
// my-cjs.cjs (CommonJS)
module.exports = {
  value: 42,
  getValue() { return this.value; }
};

// esm-consumer.mjs (ESM 导入 CJS)
import cjsModule from './my-cjs.cjs';
console.log(cjsModule.value);  // 42 — 通过 default 属性访问

// my-esm.mjs (ESM)
export const answer = 42;
export default function getAnswer() { return answer; }

// cjs-consumer.cjs (CJS 导入 ESM)
import('./my-esm.mjs').then(esm => {
  console.log(esm.answer);      // 42
  console.log(esm.default());   // 42 — 默认导出是函数
});
```

---

## 最佳实践

### 1. 项目级决策

```javascript
// 新项目推荐: package.json 配置
{
  "name": "my-project",
  "type": "module",  // 启用 ESM
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.cjs",
      "types": "./dist/types/index.d.ts"
    }
  }
}
```

### 2. 混用策略

```javascript
// 使用 .cjs 强制 CJS
// force-cjs.cjs — 即使在 type: module 项目中也是 CJS
const cjs = require('./some-cjs-module');

// 使用 .mjs 强制 ESM
// force-esm.mjs — 即使在 type: commonjs 项目中也是 ESM
import { something } from './something.mjs';
```

### 3. 路径处理差异

```javascript
// CJS
console.log(__dirname);  // 直接可用
console.log(__filename);

// ESM — 需要额外处理
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Node.js 20.11+ 可直接使用
// import.meta.dirname
// import.meta.filename
```

### 4. this 语义差异

```javascript
// CJS — this 是 module.exports
console.log(this);  // {} — 在模块顶层

// ESM — this 是 undefined (正确模块语义)
console.log(this);  // undefined
```

---

## 常见问题

### Q: setTimeout(fn, 0) 和 setImmediate 哪个先执行？

```javascript
// I/O 回调内: setImmediate 先于 setTimeout
fs.readFile('file.txt', () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
  // 输出: immediate, timeout
});

// 主体代码: 顺序不确定
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
// 输出顺序依赖系统负载，通常 timeout 先执行
```

### Q: 为什么 ESM 不能使用 require()？

ESM 的 `import` 是静态声明，在解析阶段就确定依赖图。而 `require()` 是动态表达式，运行时才知道要加载什么。这使得 ESM 能够实现：
- 静态分析（IDE 支持、tree-shaking）
- 循环依赖更好地处理
- 顶级 await

---

## 总结

| 维度 | CommonJS | ES Modules |
|------|----------|------------|
| **语法** | `require()`, `module.exports` | `import`, `export` |
| **加载时机** | 运行时同步 | 解析时异步 |
| **缓存机制** | 对象拷贝 | 实时绑定 |
| **循环依赖** | 部分初始化对象 | 延迟求值 binding |
| **Tree-shaking** | 不支持 | 支持 |
| **浏览器支持** | 需要打包 | 原生支持 |
| **Node.js 默认** | 是 (v12 前) | v12+ 可选，v20+ 推荐 |
| **动态性** | `require()` 可在条件中 | 只支持 `import()` 动态加载 |

**选型建议**: 新项目使用 ESM，享受现代生态红利；维护遗留项目时保持 CJS 或逐步迁移；发布库时考虑双模式支持。

---

## 相关资源

- [Node.js Modules 文档](https://nodejs.org/api/modules.html)
- [Node.js ESM 文档](https://nodejs.org/api/esm.html)
- [package.json exports 字段](https://nodejs.org/api/packages.html#packages_exports)
- [ESM 迁移指南](https://nodejs.org/api/modules.html#modules-ecmascript-modules)
