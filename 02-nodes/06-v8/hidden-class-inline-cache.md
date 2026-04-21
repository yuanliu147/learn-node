# Hidden Classes and Inline Caches

## Overview

Hidden classes (called "Maps" in V8 internals) are the key mechanism that enables V8 to optimize dynamic property access. Inline caches (ICs) record type feedback to enable fast property lookups.

## The Problem with Dynamic Objects

In JavaScript, objects are dynamic:
```javascript
const obj = { x: 1 };     // Add property x
obj.y = 2;                 // Add property y later
delete obj.x;              // Remove property
obj.z = 3;                 // Add another property
```

Traditional interpretation would require:
1. Dictionary lookup for each property access
2. Type checking for each operation
3. No compile-time optimization possible

## Hidden Classes (Maps)

### Concept
Instead of dictionary lookup, V8 assigns each object a hidden class that describes its structure:

```javascript
const obj = { x: 1 };
```

```
┌─────────────────────────────────────┐
│ Object                              │
│  ┌──────────────────────────────┐   │
│  │ Map (Hidden Class)           │   │
│  │  - x @ offset 0 (Smi: 1)     │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Property Addition Creates New Hidden Class

```javascript
const obj = { x: 1 };
obj.y = 2;  // Creates new hidden class!
```

```
Transition Chain:
{ x: 1 }  ──(add y)──>  { x: 1, y: 2 }  ──(add z)──>  { x: 1, y: 2, z: 3 }
Map M0               Map M1                    Map M2
```

### Hidden Class Structure

```javascript
// Map contains:
{
    constructor: Object,           // Constructor function
    prototype: Object,             // Prototype object
    descriptors: {                 // Property definitions
        x: { 
            value: <slot>,         // Location
            writable: true, 
            enumerable: true,
            configurable: true 
        }
    },
    bit_field: 0b01001,            // Flags (is_dict, has_non_instance_prototype, etc.)
    bit_field2: 0b00100,           // More flags
    // ...
}
```

### Transition Table

V8 maintains a transition table per function:

```javascript
function Point(x, y) {
    this.x = x;
    this.y = y;
}

const p1 = new Point(1, 2);  // Creates Map M0, transitions: [] → M0
                              // (No properties yet)
p1.x = 10;                    // Transition: M0 + "x" → M1
p1.y = 20;                    // Transition: M1 + "y" → M2

// After first call, V8 "knows":
// Constructor "Point" always creates objects with x, y in order
// Can pre-compute the path!
```

## Inline Caches (ICs)

### Concept
Inline caches record the result of property lookups to speed up future accesses.

### IC States

| State | Meaning | Speed |
|-------|---------|-------|
| Uninitialized | No information yet | Baseline |
| Monomorphic | Always same hidden class | Fast |
| Polymorphic | Few (2-4) hidden classes | Medium |
| Megamorphic | Many different hidden classes | Slow |

### Property Access IC

```javascript
const obj = { x: 1 };
obj.x;  // First access: cache miss, record hidden class
```

```
First access:
 1. Lookup obj's hidden class (Map M0)
 2. Look up "x" in M0's descriptors
 3. Find x at offset 0
 4. Cache: Map M0 → offset 0

Future accesses:
 1. Check obj's Map
 2. If Map is M0 → direct memory access at offset 0
 3. Much faster than dictionary lookup!
```

### IC for Property Set

```javascript
const obj = { x: 1 };
obj.x = 2;  // Check cached Map, update in-place if same
```

### Polymorphic IC

```javascript
const obj1 = { x: 1 };
const obj2 = { y: 2 };  // Different hidden class!

function getX(o) {
    return o.x;
}

getX(obj1);  // Monomorphic: M1 → "x"
getX(obj2);  // Polymorphic: M1, M2 → check each, fall back
```

## Hidden Class Best Practices

### 1. Initialize All Properties in Constructor

```javascript
// BAD: Property additions cause transitions
function Point(x, y) {
    this.x = x;
    // ... some code ...
    this.y = y;
}

// GOOD: All properties added in same order
function Point(x, y) {
    this.x = x;
    this.y = y;
}
```

### 2. Add Properties in Same Order

```javascript
// BAD: Different orders create different maps
const a = {};  a.x = 1;  a.y = 2;  // Map M1
const b = {};  b.y = 2;  b.x = 1;  // Map M2 (different!)

// GOOD: Same order
const a = {};  a.x = 1;  a.y = 2;  // Map M1
const b = {};  b.x = 1;  b.y = 2;  // Map M1 (same!)
```

### 3. Avoid Deleting Properties

```javascript
// BAD: Deleting creates dictionary mode
const obj = { x: 1, y: 2, z: 3 };
delete obj.y;  // Object goes to dictionary mode (slow!)

// GOOD: Set to undefined (keeps hidden class)
obj.y = undefined;  // Still fast access
```

### 4. Avoid Mixing Types

```javascript
// BAD: Type changes cause deoptimization
const obj = { x: 1 };
obj.x = "string";  // Type changed!

// GOOD: Keep consistent types
obj.x = 2;  // Still Smi
```

## Hidden Class and Prototype

### Prototype Chain Interaction

```javascript
const parent = { a: 1 };
const child = Object.create(parent);
child.b = 2;
```

```
child's hidden class chain:
  Map C0 (empty) → Map C1 (+b) → (parent's hidden class)
```

### Prototype Properties

Properties on prototypes also have hidden classes:

```javascript
class Animal {
    speak() { return "..."; }
}

const a = new Animal();
const b = new Animal();

// Both share the same "speak" method hidden class
// Method is stored once, referenced by both
```

## Inline Cache Structure

### IC Data Stored

```javascript
// Per call site:
{
    state: "Monomorphic",
    map: Map M1,
    offset: 0,          // Property offset
    handler: 0x123456   // Load/store handler address
}
```

### Megamorphic State

When >4 different hidden classes seen:
```javascript
function getX(obj) {
    return obj.x;
}

getX({ a: 1 });     // Map M1
getX({ b: 2 });     // Map M2
getX({ c: 3 });     // Map M3
getX({ d: 4 });     // Map M4
getX({ e: 5 });     // Megamorphic! → Generic lookup
```

### Generic Lookup (Megamorphic)
- Falls back to dictionary-style lookup
- No inline cache optimization
- Much slower than monomorphic

## Debugging Hidden Classes

### Print Objects

```bash
node --allow-natives-syntax

%DebugPrint(obj);
```

Output:
```
DebugPrint: 0x2a9b: { // object
    [class: Object]
    - map: 0x2a8f <Map[16](HOLEY_ELEMENTS)>  // Hidden class
    - properties: 0x2a7f <FixedArray[0]>   // No properties in object
    - elements: 0x2a7f <FixedArray[0]> {
    }
    - x: 1
}
```

### Print Maps

```bash
node --trace-maps
```

Output:
```
[testing hooks]
Map 0x2a8f created
  - descriptors: []
Map 0x2a9f created (new)
  - descriptors: [x:0]
Map 0x2abf created (transition)
  - descriptors: [x:0,y:1]
```

## Performance Impact

| Pattern | Access Speed | Notes |
|---------|-------------|-------|
| Monomorphic | Fastest | Direct offset access |
| Polymorphic | Medium | Check multiple maps |
| Megamorphic | Slow | Generic lookup |
| Dictionary mode | Slowest | No IC optimization |

## Related

- [Object Layout](./object-layout.md) - Memory representation
- [Turbofan Optimization](./turbofan-optimization.md) - Optimization compiler
- [Deoptimization](./deoptimization.md) - When optimization fails
