# Scavenge Algorithm (Minor GC)

## Overview

Scavenge is V8's minor garbage collection algorithm for the young generation (New Space). It's based on the Cheney algorithm and is optimized for speed and low pause times.

## Why Scavenge?

- **Generational Hypothesis**: Most objects die young
- **Performance**: Fast collection of short-lived objects
- **Efficiency**: Only copies live objects, automatically reclaiming dead ones

## Algorithm: Cheney Scavenge

### Two-Space System

```
New Space:
┌─────────────────────┬─────────────────────┐
│                     │                     │
│    From-Space       │     To-Space       │
│  (Allocation Ptr)   │   (Empty/Scanning) │
│                     │                     │
└─────────────────────┴─────────────────────┘
```

### Phases

#### 1. Evacuation Phase (Minor GC)
1. Stop JavaScript execution (GC pause)
2. Set allocation pointer to start of To-Space
3. Starting from roots (global object, stack), traverse reachable objects
4. For each live object found:
   - Copy it to To-Space using forwarding pointer
   - Update all references to point to new location
5. Update all references in the remembered set

#### 2. Swap Spaces
- From-Space and To-Space roles are swapped
- To-Space becomes the new From-Space for allocation
- Previous From-Space is now empty (available for next GC)

### Copying Process Detail

```
Before GC:
┌────────────────────────────────────────────┐
│  [A] → [B] → [C] → [D] → [E]  (dead)       │
│  [F] → [G] → [H]  (alive)                  │
│  From-Space                               │
└────────────────────────────────────────────┘

After GC (in To-Space):
┌────────────────────────────────────────────┐
│  [F'] → [G'] → [H']                        │
│  To-Space                                  │
└────────────────────────────────────────────┘
```

## Semi-Space Design

### Advantages
- **Speed**: Simple bump-pointer allocation
- **No fragmentation**: Objects are compacted during copy
- **Predictable**: Fixed pause times proportional to live data

### Disadvantages
- **Memory overhead**: Requires 2x New Space
- **Copying cost**: All live objects must be copied

## Promotion to Old Space

Objects surviving multiple scavenges are promoted to Old Space:
- After N scavenges (typically 2-3) or
- When To-Space is full

### Promotion Decision
```
if (object.age >= tenure_age || to_space_full) {
    promote_to_old_space(object);
}
```

## Remembered Set

Scavenge needs to track references from Old Space to New Space:

### Write Barrier
```javascript
// When a reference from old object to new object is created:
// 1. Record the old object in remembered set
// 2. Mark card as dirty
```

### Types of References Tracked
- Global variables referencing new objects
- Objects in Old Space referencing objects in New Space
- C++ objects holding handles to JS objects

## Optimization Techniques

### 1. Inline Cache Updating
When object moves, inline caches in JIT-compiled code must be updated

### 2. Root Set Scanning
Roots include:
- Global object
- Stack frames (local variables, parameters)
- Handles and contexts
- Hidden objects (internal V8 structures)

### 3. Lazy Sweeping
To-space scanning can be done lazily on next allocation if needed

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Pause Time | ~1-5ms typically |
| Frequency | Every ~10-50MB allocation |
| Throughput | High (only copies live objects) |
| Memory Overhead | 2x New Space |

## Tuning Parameters

```bash
# Adjust New Space size
node --max-new-space-size=2048  # Size in KB

# Adjust tenure age (scavenges before promotion)
node --min-semi-space-size=1024
```

## Heap歇

### Memory Layout After Scavenge

```
After minor GC:
┌────────────────────────────────────────────┐
│  New A: [X'] → [Y'] → [Z']   (live objects)│
│  From-Space (allocated here)              │
├────────────────────────────────────────────┤
│  To-Space: [Empty]                        │
└────────────────────────────────────────────┘
```

## Related

- [V8 Heap Structure](./v8-heap-structure.md) - Heap organization
- [Mark-Sweep-Compact](./mark-sweep-compact.md) - Major GC
- [Memory Leak Patterns](./memory-leak-patterns.md) - Common issues
