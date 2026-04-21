---
title: "Module Loading System in Node.js"
description: "Deep dive into how Node.js resolves and loads modules using CommonJS and ES Modules"
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

# Module Loading System in Node.js

## Overview

Node.js employs a sophisticated module loading system that handles two primary module formats: **CommonJS (CJS)** and **ES Modules (ESM)**. Understanding how modules are resolved, cached, and loaded is essential for building efficient and maintainable Node.js applications.

## CommonJS Module System

### How `require()` Works

The CommonJS module system is the original module format in Node.js. When you call `require('module-name')`, Node.js performs a multi-step resolution process:

```javascript
// Loading a built-in module
const fs = require('fs');

// Loading a file module (relative path)
const myModule = require('./myModule');

// Loading from node_modules
const express = require('express');
```

### Module Resolution Algorithm

Node.js uses the following resolution order for `require(X)` from module at path Y:

1. **Built-in modules** - Check if X is a Node.js built-in (fs, path, http, etc.)
2. **File modules** - If X begins with `./` or `/` or `../`
3. **node_modules** - Search in `node_modules` directories

### The Resolution Process in Detail

```javascript
// Suppose we have: require('./utils/helper')
// Node.js will try:

// 1. ./utils/helper.js
// 2. ./utils/helper.json
// 3. ./utils/helper.node (native addon)
// 4. ./utils/helper/package.json (main field)
// 5. ./utils/helper/index.js
```

### Module Caching

Once a module is loaded, it's cached in `require.cache`. This means subsequent `require()` calls return the same object instance:

```javascript
const a = require('./module');
const b = require('./module');

console.log(a === b); // true - same object reference

// Clear cache for fresh load
delete require.cache[require.resolve('./module')];
```

### The `module` Object

Every CommonJS file has access to the `module` object:

```javascript
console.log(module.id);        // Unique identifier for this module
console.log(module.filename);  // Absolute path to this file
console.log(module.loaded);    // Whether the module has finished loading
console.log(module.children);  // Modules required by this one
console.log(module.parent);    // Module that required this one

module.exports = { /* your exports */ };
exports.helper = function() { /* shorthand */ };
```

## ES Modules (ESM)

### Using ESM in Node.js

ES Modules require either:
- File extension `.mjs`
- `"type": "module"` in `package.json`

```javascript
// With .mjs extension or "type": "module"
import fs from 'fs';
import { readFile } from 'fs/promises';
import express from 'express';

// Default import
import React from 'react';

// Named imports
import { Component } from 'react';

// Dynamic import (works in both CJS and ESM)
const module = await import('./module.js');
```

### Key Differences from CommonJS

| Feature | CommonJS | ES Modules |
|---------|----------|------------|
| Syntax | `require()`, `module.exports` | `import`, `export` |
| Loading | Synchronous | Asynchronous |
| Resolution | Dynamic (runtime) | Static (compile-time) |
| Cache | Mutable objects in `require.cache` | Immutable module records |
| Hoisting | N/A | Imports hoisted to top |
| `this` | `module` object | `undefined` at top level |

### `import.meta`

ESM provides `import.meta` with metadata about the current module:

```javascript
import.meta.url;        // URL of the current module file
import.meta.resolve();  // Resolve a module specifier
import.meta.main;       // Whether running as main module
```

## Module Resolution Algorithm

### Node.js Module Resolution (CommonJS)

The `require.resolve()` algorithm follows these steps:

```javascript
// Step 1: Built-in modules
// 'fs', 'path', 'http' - returned directly

// Step 2: Relative paths (./, ../, /)
// ./utils.js -> /path/to/project/utils.js
// ../utils.js -> /path/to/utils.js

// Step 3: Core modules in node_modules
// Starting from parent directory, walk up:
// /path/to/project/node_modules/module
// /path/to/node_modules/module
// /node_modules/module
```

### Package.json Fields

Node.js respects several `package.json` fields for module resolution:

```json
{
  "name": "my-package",
  "main": "dist/index.js",           // CommonJS entry
  "module": "dist/index.mjs",        // ESM entry (for bundlers)
  "exports": {                       // Conditional exports (Node.js 12+)
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./submodule": "./dist/sub.js"
  }
}
```

### The `exports` Field (Conditional Exports)

Conditional exports allow different entry points based on import method:

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

## Advanced Module Patterns

### Circular Dependencies

Node.js handles circular dependencies, but with caveats:

```javascript
// a.js
const b = require('./b');
console.log('A: loaded, b.value =', b.value);
module.exports = { value: 'A' };

// b.js
const a = require('./a');
console.log('B: loaded, a.value =', a.value);
module.exports = { value: 'B' };

// main.js
require('./a');
// Output:
// B: loaded, a.value = undefined (a not yet exported)
// A: loaded, b.value = B
```

### Dynamic Imports

Dynamic `import()` returns a Promise, useful for:
- Code splitting
- Conditional loading
- Loading modules conditionally based on runtime conditions

```javascript
// Dynamic import of an ES module
const { default: express } = await import('express');

// Conditional loading
if (process.env.FEATURE_FLAG) {
  const analytics = await import('./analytics.js');
  analytics.track();
}
```

### Native Module Add-ons

Node.js can load native add-ons (`.node` files):

```javascript
// Built-in native addon
const binding = require('./build/Release/native addon.node');

// Using node-gyp built modules
const myModule = require('my-native-module');
```

## Best Practices

1. **Use named exports for better IDE support** - Named imports provide better autocomplete
2. **Avoid circular dependencies** - Restructure your code to prevent circular references
3. **Use `exports` field in package.json** - Better than `main` for conditional exports
4. **Prefer ES Modules for new packages** - But consider Node.js version requirements
5. **Be mindful of module caching** - Changes require cache invalidation during development

## Summary

Node.js's module loading system provides a powerful and flexible mechanism for code organization. Understanding the differences between CommonJS and ES Modules, the resolution algorithm, and caching behavior is crucial for writing efficient Node.js applications and libraries.
