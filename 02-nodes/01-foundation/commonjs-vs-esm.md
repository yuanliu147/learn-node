---
title: "CommonJS vs ES Modules (ESM) in Node.js"
description: "Comprehensive comparison of CJS and ESM module systems, including syntax, loading behavior, caching, and interoperability"
tags:
  - nodejs
  - modules
  - commonjs
  - esm
  - import
  - export
  - module-system
related:
  - event-loop-phases
  - microtask-macrotask
---

# CommonJS vs ES Modules (ESM) in Node.js

Node.js supports two module systems: **CommonJS (CJS)**, the legacy system using `require()` and `module.exports`, and **ECMAScript Modules (ESM)**, the standard JavaScript module system using `import` and `export`. Understanding both—and how they interoperate—is essential for modern Node.js development.

## At a Glance

| Aspect | CommonJS (CJS) | ES Modules (ESM) |
|--------|---------------|------------------|
| Syntax | `require()`, `module.exports` | `import`, `export` |
| Loading | Synchronous | Asynchronous (parses first, loads asynchronously) |
| When it runs | Runtime | Parse time (static structure required) |
| Circular deps | Supported, with caveats | Supported, with caveats |
| Node.js support | Native, default | Native since v12+, requires `.mjs` or `"type":"module"` |
| Browser support | Via bundlers | Native in modern browsers |

## CommonJS (CJS)

CommonJS was the default module system in Node.js for over a decade. It uses synchronous `require()` calls and `module.exports` for exports.

### Basic Syntax

```javascript
// math.js
function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

module.exports = {
  add,
  multiply,
};

// OR individual exports:
// module.exports.add = add;
// module.exports.multiply = multiply;
```

```javascript
// main.js
const { add, multiply } = require('./math');

console.log(add(2, 3));       // 5
console.log(multiply(4, 5));  // 20
```

### Named Exports in CJS

```javascript
// utils.js
exports.foo = 'bar';
exports.count = 42;

// Equivalent to:
module.exports = { foo: 'bar', count: 42 };
```

### require() and Module Resolution

```javascript
// Require a built-in module
const fs = require('fs');
const path = require('path');
const os = require('os');

// Require a local module
const myModule = require('./myModule');

// Require a package (looks in node_modules)
const express = require('express');
```

### CJS Loading Behavior

1. **Synchronous**: `require()` executes synchronously and returns the module's exports
2. **Cached**: Modules are cached after first load; subsequent `require()` calls return the cached instance
3. **Circular dependencies**: Supported, but accessing exports before they're fully initialized returns `{}` (empty object)

```javascript
// Circular dependency example
// a.js
console.log('a starting');
exports.loaded = false;
const b = require('./b');
exports.loaded = true;
console.log('a loaded, b.loaded =', b.loaded);

// b.js
console.log('b starting');
const a = require('./a');
console.log('b starting, a.loaded =', a.loaded);
module.exports = { loaded: true };

// Running node a.js:
// a starting
// b starting
// b starting, a.loaded = false   ← a is partially loaded
// a loaded, b.loaded = true
```

## ES Modules (ESM)

ESM is the ECMAScript standard for modules, adopted in ES2015. Node.js added experimental support in v8, stable support in v12, and made it non-experimental in v14.

### Enabling ESM in Node.js

**Option 1**: Use `.mjs` extension
```bash
# File: math.mjs
```

**Option 2**: Use `.js` extension with `package.json`:
```json
{
  "type": "module"
}
```

**Option 3**: Use `package.json` with explicit `"type": "module"` at project root.

### Basic Syntax

```javascript
// math.mjs
export function add(a, b) {
  return a + b;
}

export const multiply = (a, b) => a * b;

// Default export
export default function divide(a, b) {
  return a / b;
}
```

```javascript
// main.mjs
import add, { multiply } from './math.mjs';
// Or: import { add, multiply } from './math.mjs';

console.log(add(2, 3));       // 5
console.log(multiply(4, 5));  // 20
```

### ESM Syntax Rules

1. **`import` and `export` must be at the top level** — they are static and cannot be inside conditionals or functions (this is a parse-time requirement, not runtime)
2. **Cannot use `require()`** in ESM files
3. **Cannot use `__dirname` or `__filename`** directly (use `import.meta.dirname` and `import.meta.filename`)

```javascript
// INVALID in ESM - cannot use import conditionally:
if (someCondition) {
  import('./module.js');  // SyntaxError! Use dynamic import() instead
}

// VALID: Dynamic import()
const module = await import('./module.js');
```

### Named vs Default Exports

```javascript
// lib.js
export const version = '1.0.0';
export function greet(name) {
  return `Hello, ${name}`;
}

// Default export
export default class API {
  // ...
}
```

```javascript
// main.js
// Named imports
import { version, greet } from './lib.js';

// Default import
import API from './lib.js';

// Combine
import API, { version, greet } from './lib.js';

// Namespace import
import * as lib from './lib.js';
console.log(lib.version);  // '1.0.0'
```

### import.meta

ESM provides metadata about the current module via `import.meta`:

```javascript
import.meta.url       // File URL of the current module
import.meta.dirname   // Directory name (Node.js 20.11+)
import.meta.filename  // File name (Node.js 20.11+)
import.meta.resolve('lodash')  // Resolved path to a module
```

### Dynamic import()

ESM supports dynamic imports for conditional or lazy loading:

```javascript
// main.js
async function loadFeature() {
  if (needsFeature) {
    const { feature } = await import('./feature.js');
    feature();
  }
}
```

`import()` returns a Promise and is not bound to the static `import` statement rules.

## Key Differences in Behavior

### 1. Module Resolution

**CJS** resolves modules at runtime:
```javascript
// Resolves at require() call time
const mod = require('./' + 'module');
```

**ESM** resolves all imports before code executes (static analysis):
```javascript
// This is valid ESM:
import('./module.js').then(...);

// But this is NOT valid ESM:
import(path + '/module.js');  // SyntaxError: import requires a string literal
```

### 2. this at Module Scope

- **CJS**: `this` at module scope is `module.exports` (equivalent to `module`)
- **ESM**: `this` at module scope is `undefined` (proper module scoping)

```javascript
// CJS
console.log(this);  // {}

// ESM
console.log(this);  // undefined
```

### 3. Caching Behavior

Both module systems cache modules, but with slightly different semantics.

**CJS**: Cache stores the `module.exports` object. Mutating this object affects all consumers.

```javascript
// counter.js
let count = 0;
module.exports = { count, increment: () => count++ };

// a.js
const c1 = require('./counter');
c1.increment();
c1.increment();

// b.js - same cache, sees updated count
const c2 = require('./counter');
console.log(c2.count);  // 2
```

**ESM**: Exports are live bindings. Reassigning an exported binding propagates.

```javascript
// counter.mjs
let count = 0;
export { count };
export function increment() { count++; }

// a.mjs
import { count, increment } from './counter.mjs';
increment();
increment();

// b.mjs
import { count } from './counter.mjs';
console.log(count);  // 2
```

### 4. Circular Dependencies

Both systems support circular dependencies, but the mechanisms differ.

**CJS** gives you a partially initialized module object:
```javascript
// a.js
const b = require('./b');
module.exports = { b, name: 'a' };  // b might be partially loaded
```

**ESM** gives you live bindings that resolve when accessed:
```javascript
// a.mjs
import { b } from './b.mjs';
export const name = 'a';
export function getB() { return b; }  // getter-based access

// b.mjs
import { name } from './a.mjs';  // name is 'a' even if module not fully initialized
export const b = 'module b';
```

### 5. Synchronous vs Asynchronous Loading

- **CJS**: Synchronous `require()` — blocks until the module is fully loaded and executed
- **ESM**: The `import` declaration is synchronous (static), but the loading process is asynchronous and the module graph is validated before any code runs

```javascript
// CJS - synchronous, blocks
const foo = require('./foo');
console.log(foo);  // Module already executed

// ESM - static imports resolve before any module code runs
import foo from './foo.mjs';
console.log(foo);  // Module already executed
```

## Interoperability: Using CJS from ESM and Vice Versa

Node.js supports mixing both module systems with some rules:

### Importing CJS from ESM

```javascript
// my-cjs-module.js (or .cjs)
module.exports = { value: 42 };
```

```javascript
// my-esm.mjs
import cjsModule from './my-cjs-module.cjs';
// Or with namespace:
import * as cjsModule from './my-cjs-module.cjs';

console.log(cjsModule.default.value);  // 42
```

**Key rule**: CJS modules have **only a default export** from ESM's perspective. You access `module.exports` as `module.default`.

```javascript
// my-cjs.js
module.exports = { foo: 'bar' };

// ESM import
import cjs from './my-cjs.js';
console.log(cjs.foo);  // 'bar' — accessed via default property
```

### Importing ESM from CJS

```javascript
// my-esm.mjs
export const answer = 42;
export default function getAnswer() { return answer; }
```

```javascript
// my-cjs.cjs
// NOT DIRECTLY POSSIBLE — ESM cannot be required synchronously

// Workaround: use dynamic import()
import('./my-esm.mjs').then(esm => {
  console.log(esm.answer);         // 42
  console.log(esm.default());      // 42
});
```

**Key rule**: You **cannot** use static `import` from CJS. You must use dynamic `import()` which returns a Promise.

### Dual Package Hazard

When a package ships **both** CJS and ESM versions, Node.js uses the `exports` field in `package.json` to determine which to load:

```json
{
  "name": "my-package",
  "exports": {
    "import": "./dist/esm/index.js",
    "require": "./dist/cjs/index.js"
  },
  "main": "./dist/cjs/index.js"
}
```

When the same module is loaded via both systems, you get **two separate module instances**, which can cause bugs:

```javascript
// main.mjs
import pkg from 'dual-pkg';
console.log(pkg.versions());  // {}

/ node.cjs
const pkg = require('dual-pkg');
pkg.increment();
console.log(pkg.versions());  // { count: 1 } ← DIFFERENT instance!
```

Solution: Use `"module"` package type and ensure the package properly exports ESM for both entry points, or use packages that provide only one module system.

## __dirname, __filename, and import.meta

```javascript
// CJS
console.log(__dirname);  // /path/to/project/src
console.log(__filename); // /path/to/project/src/main.js

// ESM - use import.meta
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

Node.js 20.11+ provides `import.meta.dirname` and `import.meta.filename` directly.

## Package.json type Field

```json
{
  "type": "module"
}
```

- With `"type": "module"`: All `.js` files are treated as ESM
- Without it (or `"type": "commonjs"`): All `.js` files are treated as CJS

Use `.cjs` extension to force CJS even in a `"type": "module"` package:
```javascript
// force-cjs.cjs — always CommonJS regardless of package.json
const cjs = require('./something');
```

Use `.mjs` extension to force ESM even in a `"type": "commonjs"` package:
```javascript
// force-esm.mjs — always ESM regardless of package.json
import { something } from './something.mjs';
```

## Best Practices

1. **Pick one system per project** — mixing creates cognitive overhead and potential bugs
2. **Prefer ESM for new packages** — it's the standard, better tree-shaking, used by bundlers
3. **Use CJS for Node.js-only utilities** that don't need bundler features
4. **Use `exports` field in package.json** instead of `main` for proper dual-package support
5. **Avoid circular dependencies** — they're supported but make code harder to reason about
6. **Don't mix require and import** in the same file — it's invalid syntax

## Summary

- **CommonJS** (`require`/`module.exports`) is synchronous, runtime-resolved, and the historical Node.js default
- **ES Modules** (`import`/`export`) is asynchronous-aware, statically parsed, and the ECMAScript standard
- ESM enables better tooling (tree-shaking, static analysis), while CJS remains simpler for direct Node.js use
- Interoperability exists but has quirks: ESM sees CJS as having only a default export; CJS cannot directly import ESM without dynamic `import()`
- The ecosystem is still transitioning—many npm packages ship both formats via the `exports` field

## References

- [Node.js Modules documentation](https://nodejs.org/api/modules.html)
- [Node.js ESM documentation](https://nodejs.org/api/esm.html)
- [ESM in Node.js: A (not so) complete guide](https://nodejs.org/api/modules.html#modules-ecmascript-modules)
- [package.json exports field](https://nodejs.org/api/packages.html#packages_exports)
