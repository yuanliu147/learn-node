# Object Layout in V8

## Overview

Understanding how V8 represents JavaScript objects in memory is essential for debugging memory issues and writing performant code.

## Object Header

Every V8 object has a fixed-size header:

### Object Header Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Header (2 or 3 machine words)                                │
├──────────────┬──────────────────────────────────────────────┤
│ Map Pointer  │  Properties/Element Metadata                 │
│ (word)       │  (word or two)                               │
└──────────────┴──────────────────────────────────────────────┘
```

### Header Fields

| Field | Size | Description |
|-------|------|-------------|
| Map Pointer | Word | Pointer to hidden class (Map) |
| Properties | Word | Pointer to properties backing store OR in-object properties bitmap |
| Elements | Word | Pointer to elements backing store OR elements kind |
| Optional Padding | Word | Alignment padding (32-bit values) |

### Word Size
- **32-bit systems**: 4 bytes per word
- **64-bit systems**: 8 bytes per word (with possible compression)

## Object Types

### 1. Small Integers (Smi)

```
┌─────────────────────────┐
│ Smi Value (31 bits)     │  ← Immediate value, no pointer
│ [tag: 0]                │
└─────────────────────────┘
```

- **Range**: -2^31 to 2^31-1 (31 bits on 64-bit)
- **Storage**: Inline in the value slot (no heap allocation)
- **Tag bit**: LSB is 0 to indicate Smi

### 2. Heap Objects

```
┌───────────────────────────────────────────────────────┐
│ Map Ptr │ Properties Metadata │ Elements │ Fields... │
└───────────────────────────────────────────────────────┘
```

All objects larger than Smi are heap objects with a Map pointer.

## Property Storage

### In-Object Properties

For objects with few properties (<= 4 typically), properties are stored directly in the object:

```javascript
const obj = { x: 1, y: 2 };
```

```
┌────────────────────────────────────────────────────┐
│ Map     │ Properties Metadata │ Elements │ x:1 │ y:2 │
└────────────────────────────────────────────────────┘
         ↑ Metadata indicates in-object storage
```

**Advantages**: Fast access, no pointer chase

### Properties Backing Store

For objects with many properties, V8 allocates a separate dictionary:

```javascript
const obj = {};
for (let i = 0; i < 100; i++) {
    obj["prop" + i] = i;
}
```

```
┌─────────────────┐          ┌─────────────────────────┐
│ Object          │          │ Properties Dictionary   │
│  ┌───────────┐  │    ────→ │  prop0: 0               │
│  │ Map        │  │          │  prop1: 1               │
│  │ Properties │────────────│  prop2: 2               │
│  │ Elements   │  │          │  ...                    │
│  └───────────┘  │          │  prop99: 99             │
└─────────────────┘          └─────────────────────────┘
```

**Disadvantages**: Slower access, more memory, no hidden class optimization

### Property Storage Summary

| Storage Type | Trigger | Access Speed |
|-------------|---------|--------------|
| In-object | ≤ 4-8 properties | Fastest |
| Fast properties | 4-100 properties | Fast |
| Dictionary | > 100 properties or deleted properties | Slow |

## Elements Storage

### Elements Descriptor

All arrays and objects with indexed properties have an elements backing store:

```javascript
const arr = [1, 2, 3, 4, 5];
```

```
┌─────────────────────────────────────────────────────┐
│ Object          │                                 │
│  ┌───────────┐  │   ┌─────────────────────────┐   │
│  │ Map        │  │   │ Elements Backing Store  │   │
│  │ Properties │  │   │  [1, 2, 3, 4, 5]         │   │
│  │ Elements   │────────  (contiguous)         │   │
│  └───────────┘  │   └─────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Elements Kind

V8 optimizes based on the type of elements:

| Kind | Description | Optimization |
|------|-------------|--------------|
| `Smi` | Small integers only | Fast integer operations |
| `Double` | Numbers (including doubles) | Fast float operations |
| `Object` | Any objects | Generic operations |
| `Holey` | Sparse/deletions | Slower, needs bounds check |
| `Packed` | No holes | Vectorization possible |

### Holey vs Packed Elements

```javascript
// Packed
const a1 = [1, 2, 3];      // PackedSmi elements

// Holey
const a2 = [1, , 3];       // HoleySmi elements (middle deleted)
const a3 = [1, 2, 3];
delete a3[1];               // Now holey
```

## String Representation

### String Types in V8

| Type | Storage | Size |
|------|---------|------|
| Seq-String | Contiguous characters | Variable |
| Sliced-String | Reference + offset + length | Small overhead |
| Cons-String | Two concatenated strings | For concatenation |
| External-String | Reference to external buffer | For native strings |

### String Memory Layout

```
┌─────────────────────────────────────────────────────┐
│ Map │ Length │ Hash │ Char Data...                  │
└─────────────────────────────────────────────────────┘
```

### Cons-String (Thin String)

```javascript
const s = "hello" + "world";  // V8 may use cons-string
```

```
┌─────────────────────────────────────────────────────┐
│ ConsString:                                        │
│  ┌──────┴──────┐                                   │
│ "hello"      "world"                               │
└─────────────────────────────────────────────────────┘
```

V8 optimizes by lazily flattening when needed.

## Closure and Context

### Closure Memory Layout

```javascript
function outer() {
    const x = 1;
    const y = 2;
    return function inner() {
        return x + y;
    };
}
```

```
┌─────────────────────────────────────────────────────┐
│ Closure (inner function)                            │
│  ┌───────────────────────────────────────────────┐  │
│  │ Context (linked list)                         │  │
│  │   x: 1 ← captured by inner                    │  │
│  │   y: 2 ← captured by inner                   │  │
│  │   (parent context linked)                    │  │
│  └───────────────────────────────────────────────┘  │
│  SharedFunctionInfo                                │
│  Code (bytecode or optimized machine code)         │
└─────────────────────────────────────────────────────┘
```

### Context Chain

```
Context[inner] ──→ Context[outer] ──→ Native Context
```

## ArrayBuffer and TypedArrays

### ArrayBuffer

```javascript
const buffer = new ArrayBuffer(1024);
```

```
┌─────────────────────────────────────────────────────┐
│ ArrayBuffer                                         │
│  ┌───────────────────────────────────────────────┐  │
│  │ Backing Store (raw memory)                    │  │
│  │  1024 bytes allocated                         │  │
│  └───────────────────────────────────────────────┘  │
│  Buffer info (is neutered, etc.)                   │
└─────────────────────────────────────────────────────┘
```

### TypedArrays

```javascript
const int32 = new Int32Array(buffer);
```

```
┌─────────────────────────────────────────────────────┐
│ TypedArray (Int32Array)                            │
│  ┌───────────────────────────────────────────────┐  │
│  │ Pointer to ArrayBuffer backing store          │  │
│  │ Length: 256 (1024 / 4)                        │  │
│  │ Byte offset: 0                                │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Memory Alignment

### Object Alignment

- **32-bit**: 4-byte alignment
- **64-bit**: 8-byte alignment (may vary)

### Object Size Calculation

```javascript
// For object with 3 properties, no elements:
object_size = header_size + (properties_in_object * word_size)

// Example (64-bit):
// Header: 3 words (24 bytes)
// 3 properties: 3 * 8 = 24 bytes
// Total: 48 bytes (rounded to alignment)
```

## Object Shapes and Hidden Classes

### Shape Sharing

Objects with same properties share hidden class:

```javascript
const a = { x: 1, y: 2 };
const b = { x: 3, y: 4 };
// Both share same hidden class!
```

```
┌─────────────┐     ┌─────────────┐
│ Object A    │     │ Object B    │
│  Map ───────┼─────┼── Map       │
│  x: 1 │ y: 2│     │  x: 3 │ y: 4│
└─────────────┘     └─────────────┘
```

## Related

- [Hidden Class & Inline Cache](./hidden-class-inline-cache.md) - Hidden class mechanism
- [V8 Heap Structure](./v8-heap-structure.md) - Heap organization
- [Memory Leak Patterns](./memory-leak-patterns.md) - Memory issues
