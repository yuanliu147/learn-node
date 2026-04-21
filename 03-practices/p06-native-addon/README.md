# Native Addon (p06)

A demonstration of building a native Node.js addon using C++ and N-API.

## Overview

This project demonstrates:
- Creating a native addon with N-API (stable ABI)
- Writing C++ bindings for JavaScript
- Building with node-gyp
- Testing native code from JavaScript

## Prerequisites

- Node.js 14+ 
- Python 3.x (for node-gyp)
- C++ compiler (GCC, Clang, or MSVC)

## Quick Start

```bash
npm install
npm run build
npm test
```

## Project Structure

```
├── src/
│   ├── index.js          # Main entry point
│   ├── addon.cc          # C++ addon implementation
│   └── addon.h           # Header file
├── binding.gyp           # Build configuration
└── test/
    └── addon.test.js     # Unit tests
```

## Usage

```javascript
const addon = require('./src/addon');

console.log(addon.add(2, 3));           // 5
console.log(addon.fibonacci(10));       // 55
console.log(addon.isPrime(17));         // true
console.log(addon.getVersion());        // Node version string
```

## License

MIT
