# Turbofan Optimization

## Overview

Turbofan is V8's optimizing JIT compiler. It takes bytecode with type feedback from Ignition and compiles it to highly optimized machine code for frequently executed functions.

## Optimization Pipeline

```
JavaScript Source
       ↓
   Ignition (Interpreter)
       ↓
   Bytecode + Type Feedback
       ↓
   Turbofan (Optimizing Compiler)
       ↓
   Sea of Nodes IR
       ↓
   Optimization passes
       ↓
   Machine Code (Optimized)
```

## Turbofan Architecture

### Sea of Nodes IR

Turbofan uses a sea of nodes intermediate representation:

```
┌─────────────────────────────────────────────┐
│                 +---+                       │
│             ┌───│Add│───┐                   │
│             │   +---+   │                   │
│        +----+-+       +-+----+               │
│        │LoadX │       │LoadY│               │
│        +------+       +------+               │
│                                             │
│  Nodes are operations                       │
│  Edges are data dependencies                │
│  No explicit control flow ordering          │
└─────────────────────────────────────────────┘
```

### Benefits of Sea of Nodes
- **Simplifies optimization**: Operations don't have fixed order
- **Better analysis**: Dependencies are explicit edges
- **Scheduling flexibility**: Can reorder for pipeline efficiency

## Key Optimizations

### 1. Type Specialization

```javascript
// JavaScript
function add(a, b) {
    return a + b;
}

// Observed types: both arguments are always integers
// Turbofan generates specialized integer code:
//
// add_int_int:
//   mov eax, [esp+4]    ; load a
//   add eax, [esp+8]    ; add b
//   ret                 ; return in eax
```

#### Specialized Code Paths
| Observed Types | Generated Code |
|----------------|-----------------|
| Smi + Smi | Fast integer addition |
| Float64 + Float64 | Fast floating point |
| String + String | Fast string concatenation |
| Mixed | Generic (slow) handler |

### 2. Inlining

Replacing function calls with the function's body:

```javascript
// Original code
function square(x) {
    return x * x;
}

function calc(n) {
    return square(n) + square(n + 1);
}

// After inlining:
function calc(n) {
    // square(n) inlined:
    const t0 = n * n;
    // square(n + 1) inlined:
    const t1 = (n + 1) * (n + 1);
    return t0 + t1;
}
```

#### Inlining Benefits
- Eliminates call overhead
- Enables further optimizations across call sites
- Allows specialization based on context

#### Inlining Criteria
- Function is "hot" (called frequently)
- Function is small enough
- Call site is stable (same types)

### 3. Escape Analysis

Determining if objects can be stack-allocated:

```javascript
// Before escape analysis:
function createPoint(x, y) {
    return { x: x, y: y };
}

const p = createPoint(10, 20);
// Point escapes (returned, stored externally)
```

```javascript
// After optimization with escape analysis:
function createPoint(x, y) {
    // Point doesn't escape - can be stack allocated
    // or registers can be used directly
    return { x: x, y: y };
}

const p_x = 10, p_y = 20;  // Direct register allocation
// No heap allocation needed!
```

### 4. Loop Optimizations

#### Loop Invariant Code Motion
```javascript
// Before:
for (let i = 0; i < n; i++) {
    arr[i] = x + y + z;  // x + y + z computed every iteration
}

// After:
const tmp = x + y + z;  // Moved outside loop
for (let i = 0; i < n; i++) {
    arr[i] = tmp;
}
```

#### Loop Unrolling
```javascript
// Before:
for (let i = 0; i < 1000; i++) {
    sum += arr[i];
}

// After (4x unroll):
for (let i = 0; i < 1000; i += 4) {
    sum += arr[i] + arr[i+1] + arr[i+2] + arr[i+3];
}
```

### 5. Dead Code Elimination

```javascript
// Before:
function unused(x) {
    const a = x * 2;  // Never used
    const b = x + 1;  // Used
    return b * 2;
}

// After optimization:
// 'a' computation eliminated
function optimized(x) {
    return (x + 1) * 2;
}
```

### 6. Constant Folding

```javascript
// Before:
const x = 1000000 * 1000000;

// After:
// x = 1000000000000 (computed at compile time)
```

## Optimization Levels

Turbofan applies optimizations progressively:

| Level | Trigger | Optimizations |
|-------|---------|---------------|
| 0 | Bytecode execution | None |
| 1 | Warm (counters > 100) | Simple inlining, type checks |
| 2 | Hot (counters > 1000) | More inlining, escape analysis |
| 3 | Very hot (counters > 10000) | Aggressive inlining, vectorization |

## Native Syntax Tree (AST) Context

Turbofan builds from bytecode, not original AST:

```
Bytecode → Bytecode Graph → Turbosfan Graph
                              ↓
                         Optimized Graph
                              ↓
                         Machine Code
```

### Differences from Ignition's AST
- Turbofan operates on its own IR (sea of nodes)
- Not directly tied to JavaScript syntax
- More suitable for machine optimization

## Code Generation

### Register Allocation

Turbofan uses **linear scan register allocation**:

```javascript
function add(a, b, c) {
    return (a + b) + c;
}

// Registers: eax, ebx, ecx
// Generated:
//   mov eax, [esp+4]    ; a
//   add eax, [esp+8]    ; b
//   add eax, [esp+12]   ; c
//   ret
```

### Instruction Selection

Turbofan selects optimal machine instructions:

```javascript
// Instead of generic multiply-by-2:
//   imul eax, eax, 2    ; 3 cycles

// Turbofan optimizes to:
//   add eax, eax         ; 1 cycle (same result, faster)
```

## Deoptimization Support

Turbofan must handle cases where assumptions fail:

### Assumptions Made
- Types remain the same
- Shapes (hidden classes) don't change
- Code paths remain valid

### Deoptimization Trigger
```javascript
function add(a, b) {
    return a + b;
}

add(1, 2);     // Integer path optimized
add(1, "x");   // Type changed! → Deoptimize
```

### Deoptimization Process
```
1. Assumption violated
2. Jump to deoptimization handler
3. Restore interpreter state
4. Return to bytecode execution
5. May re-optimize later with new types
```

## Performance Characteristics

### When Turbofan Helps
| Code Pattern | Speedup |
|--------------|---------|
| Type-stable numeric code | 10-100x |
| Type-stable object access | 5-20x |
| Polymorphic calls | 2-5x |
| Megamorphic calls | ~1x (no benefit) |
| Type-changing code | 0.5-1x (slowdown) |

### Compilation Overhead
- **Turbofan compilation**: ~100ms for complex functions
- **Ignition execution**: ~1μs per bytecode
- Trade-off: Worth it for hot code executed millions of times

## Configuration

```bash
# Disable Turbofan (debugging)
node --jitless

# Disable optimizations
node --allow-natives-syntax
%NeverOptimizeFunction(add)

# Force tiering
node --force-turbo
```

## Related

- [Ignition Bytecode](./ignition-bytecode.md) - Interpreter
- [Deoptimization](./deoptimization.md) - Optimization failures
- [Hidden Class & Inline Cache](./hidden-class-inline-cache.md) - Type feedback
