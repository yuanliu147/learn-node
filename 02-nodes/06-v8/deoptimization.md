# Deoptimization

## Overview

Deoptimization is the process where V8 discards optimized machine code and returns to bytecode execution when assumptions made during optimization are violated.

## Why Deoptimization Exists

```javascript
function add(a, b) {
    return a + b;
}

// Turbofan sees: add(1, 2) → generates integer-only code
// Fast path: Two integers → fast integer addition

add(1, 2);       // Works with optimized code
add("a", "b");   // Types changed! Need to deoptimize
```

Without deoptimization, V8 would either:
1. Generate only slow, generic code (poor performance)
2. Produce incorrect results when types change (unsound)

## Deoptimization Triggers

### 1. Type Feedback Violation

```javascript
function getX(obj) {
    return obj.x;
}

getX({ x: 1 });      // Optimized for objects with 'x'
getX({ x: "str" });  // Type changed → deoptimize
getX({ y: 2 });      // Shape changed → deoptimize
```

### 2. Hidden Class Changes

```javascript
const obj = { x: 1, y: 2 };
// Turbofan optimizes assuming obj has Map M1

obj.z = 3;  // New property → new Map → deoptimize
```

### 3. Function Arguments Change

```javascript
function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
}

sum([1, 2, 3]);        // Array of integers - optimized
sum([1, "2", 3]);      // Mixed types - deoptimize
sum({ length: 3 });    // Not an array - deoptimize
```

### 4. Value Tracking Violations

```javascript
function isPositive(n) {
    return n > 0;
}

isPositive(5);        // Optimized: true
isPositive(-1);       // Still works
isPositive("a");      // Type changed - deoptimize
```

## Deoptimization Mechanism

### Assumption Recording

When Turbofan optimizes:
```javascript
function add(a, b) {
    return a + b;
}

// Turbofan observes:
// - a is always Smi (small integer)
// - b is always Smi
// → Generates: add_smi_smi (fast integer only)
```

Assumptions recorded:
```
{ add:
  [
    { type: "Smi", slot: "a" },
    { type: "Smi", slot: "b" },
    { type: "Smi", slot: "return" }
  ]
}
```

### Deoptimization Trigger

```javascript
add(1, 2);   // Fast path, result = 3 (Smi)
add(1.5, 2); // Type check fails → deoptimization
```

### Deoptimization Sequence

```
1. Type check fails at runtime
2. Jump to deoptimization handler
3. Handler:
   - Record reason for deoptimization
   - Restore state to bytecode interpreter
   - Mark function for re-optimization
4. Return to Ignition bytecode execution
5. If function is hot again, re-optimize with new types
```

## Deoptimization Reasons

### Common Deoptimization Reasons

| Reason | Description |
|--------|-------------|
| `wrong_type` | Type differs from assumed |
| `out_of_bounds` | Array index out of bounds |
| `elements_kind` | Elements kind changed (Smi→Double→Object) |
| `wrong_map` | Hidden class changed |
| `not_mapped` | Property not found in expected location |
| `closure_changed` | Closure environment changed |

### Debugging Deoptimizations

```bash
# Enable deoptimization logging
node --trace-deopt app.js

# Also trace optimizations
node --trace-opt app.js
```

Output:
```
[deoptimize] function add @ 0x2a8b (reason: wrong_type)
  - expected: Smi
  - actual: HeapObject
```

### Using Natives Syntax

```javascript
// Enable natives syntax
node --allow-natives-syntax

// Get deoptimization info
%DeoptimizeFunction(add);
%DeoptimizeAll();

// Get function info
console.log(%GetOptimizationStatus(add));
```

## Deoptimization Impact

### Performance Impact

| Phase | Time |
|-------|------|
| Compilation to bytecode | ~1ms |
| Optimization (Turbofan) | ~100ms |
| Deoptimization | ~10-50ms |
| Re-optimization | ~100ms |

### Impact on Application

- **First occurrence**: Brief pause, then continues
- **Frequent deopts**: Significant performance degradation
- **Bad case**: Infinite deoptimize/reoptimize loop

## Preventing Deoptimization

### 1. Maintain Type Stability

```javascript
// BAD: Type changes
function process(item) {
    if (typeof item === "number") {
        return item * 2;
    }
    return String(item);
}

// GOOD: Consistent types
function process(item) {
    return item * 2;  // All numbers
}
```

### 2. Initialize Objects Consistently

```javascript
// BAD: Different initialization patterns
function Point(x, y) {
    if (x !== undefined) {
        this.x = x;
    }
    if (y !== undefined) {
        this.y = y;
    }
}

// GOOD: Always initialize same properties
function Point(x = 0, y = 0) {
    this.x = x;
    this.y = y;
}
```

### 3. Avoid Mixed-Type Arrays

```javascript
// BAD: Mixed types
const arr = [1, "2", 3];

// GOOD: Single type
const arr = [1, 2, 3];

// Or use TypedArrays for numbers
const arr = new Float64Array([1, 2, 3]);
```

### 4. Don't Delete Properties

```javascript
// BAD: Deletes property, forces dictionary mode
delete obj.x;

// GOOD: Set to undefined
obj.x = undefined;
```

### 5. Avoid arguments Aliasing

```javascript
// BAD: arguments aliasing
function f(a) {
    arguments[0] = 10;  // Changes 'a'
    return a;
}

// GOOD: Avoid modifying arguments
function f(a) {
    const local = a;  // Use copy
    return local;
}
```

## Forced Deoptimization

### For Testing/Debugging

```javascript
node --allow-natives-syntax

// Force deoptimize a function
%DeoptimizeFunction(myFunction);

// Deoptimize all functions
%DeoptimizeAll();
```

### Checking Optimization Status

```javascript
node --allow-natives-syntax

%OptimizeFunctionOnNextCall(myFunction);
myFunction();  // Will be optimized

%GetOptimizationStatus(myFunction);
// Returns: 1=optimized, 2=deoptimized, 3=never optimized, etc.
```

## Re-optimization

After deoptimization:
```
1. Function runs in bytecode (Ignition)
2. Type feedback collected again
3. If hot enough, re-optimized
4. May get different optimization based on new feedback
```

### Re-optimization Triggers
- Function called many times
- Types become stable again
- Turbofan decides it's worth optimizing

## Deoptimization in Production

### Impact on Performance

```javascript
// In production:
const start = Date.now();
for (let i = 0; i < 1000000; i++) {
    process(data);  // If deopt happens here...
}
const duration = Date.now() - start;
```

### Monitoring

```javascript
// Check if function was deoptimized
const v8 = require('v8');
// Use v8.getHeapStatistics() after running code

// Use --prof for profiling
node --prof app.js
node --prof-process isolate-*.log | less
```

### Turbolizer Tool

Visualize optimization/deoptimization:
```bash
# Generate tick processor output
node --prof --prof-profile-filter=myFunc app.js

# View in Turbolizer
# (Located in V8 repo/tools/turbolizer)
```

## Related

- [Turbofan Optimization](./turbofan-optimization.md) - Optimization compiler
- [Hidden Class & Inline Cache](./hidden-class-inline-cache.md) - Type feedback
- [Ignition Bytecode](./ignition-bytecode.md) - Interpreter
