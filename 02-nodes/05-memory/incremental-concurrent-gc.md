# Incremental and Concurrent GC

## Overview

Modern V8 uses sophisticated garbage collection strategies that combine incremental and concurrent techniques to minimize pause times while maintaining throughput.

## Why Incremental & Concurrent?

| Approach | Benefit | Tradeoff |
|----------|---------|----------|
| Stop-the-world | Simple, consistent | Long pauses |
| Incremental | Shorter pauses | More overhead |
| Concurrent | No pause for GC work | Complex synchronization |

## Incremental GC

### Concept
Break major GC work into small increments interleaved with JavaScript execution.

```
Traditional GC:
|---- JavaScript ----|[GC Pause|---- JavaScript ----|[GC Pause

Incremental GC:
|--JS--[incr1]--JS--[incr2]--JS--[incr3]--JS--[finalize]--JS
```

### Incremental Marking

#### Three-Color Invariant
```javascript
// White: Unmarked (potentially garbage)
// Grey: Marked, needs scanning
// Black: Marked, fully scanned

// WRONG (violates invariant):
// Black object referencing White object

// Correct: Grey or Black references only to Grey or Black
```

#### Write Barrier (Incremental)
When mutator writes a reference:
```javascript
function writeBarrier(object, property, newValue) {
    // If old value was white and we reference it, need to process
    if (isWhite(newValue) && isBlack(object)) {
        addToMarkStack(newValue);  // Prevent dangling white reference
    }
}
```

#### Steps to Mark Incrementally
1. **Initial**: Mark roots, push to stack
2. **Incremental step**: Pop and mark a few objects
3. **Complete**: All reachable objects marked

### Incremental Sweeping

- Sweep one page at a time
- Happens during allocation when space needed
- Can be paused and resumed

### Incremental Compaction

- Move objects in small increments
- Requires updating references incrementally
- More complex than marking

## Concurrent GC

### Concept
GC work runs simultaneously with JavaScript execution on different threads.

```
Mutator Thread:     |--JS--|--JS--|--JS--|
                        ↓
GC Thread:     [Concurrent Mark] [Concurrent Sweep]
```

### Concurrent Marking

#### Implementation
1. Main thread: Start marking, set initial state
2. GC threads: Traverse object graph concurrently
3. Main thread: Handle writes via barrier, finalize

#### Synchronization Challenges

**Safe Point Coordination**
```javascript
// Mutator must reach safe point for certain operations
// GC waits at safepoint or uses handshakes
```

**原子操作 for Reference Updates**
```javascript
// When updating references:
// 1. Use atomic operations or locks
// 2. Ensure no partial states visible to GC
```

### Concurrent Sweeping

- GC threads sweep pages independently
- Main thread allocates from swept pages
- Free lists updated atomically

### Concurrent Compaction

Most complex to implement:
- Object moves happen concurrently
- All references must be updated
- Requires careful synchronization

## Hybrid Approaches in V8

### Orinoco (V8's GC Framework)

V8's modern GC combines these strategies:

```
Young Generation:
- Stop-the-world Scavenge (fast, short pauses)

Old Generation:
- Incremental marking (reduces pause)
- Concurrent marking (no pause for marking)
- Parallel compaction (faster compaction)
```

### GC Schedule

```
1. Minor GC (Scavenge): Every ~10-50MB allocation
2. If old space high:
   - Start incremental mark
   - Background concurrent marking
3. If allocation fails:
   - Stop for finalization
   - Perform sweep/compact if needed
```

## Mark-Track-Compact

### Full Flow

```
┌──────────────────────────────────────────────────────────┐
│ 1. Mark (Incremental + Concurrent)                       │
│    - Start from roots                                   │
│    - GC threads mark concurrently                        │
│    - Write barrier maintains tri-color invariant        │
├──────────────────────────────────────────────────────────┤
│ 2. Mark-Complete (Brief pause)                           │
│    - Ensure all marking done                             │
│    - Prepare for sweeping                               │
├──────────────────────────────────────────────────────────┤
│ 3. Sweep (Concurrent, per-page)                          │
│    - GC threads sweep pages                              │
│    - Build free lists                                   │
├──────────────────────────────────────────────────────────┤
│ 4. Compact (Parallel or Incremental)                    │
│    - Move objects to reduce fragmentation               │
│    - Update references                                  │
└──────────────────────────────────────────────────────────┘
```

## Performance Characteristics

| Strategy | Pause Reduction | Complexity | Throughput |
|----------|----------------|------------|------------|
| Incremental | 50-90% | Medium | Slight decrease |
| Concurrent | Near-zero for marking | High | Good |
| Combined | Best | Very High | Good |

## Configuration

```bash
# GC experiments
node --gc-interval=100
node --incremental-marking=true
node --concurrent-marking=true

# Disable features for debugging
node --noincremental-marking
node --nostress-concurrent-marking
```

## Real-World Impact

For a typical web application:
- **Without**: 100-500ms GC pauses
- **With incremental**: 10-50ms pauses
- **With concurrent**: 1-10ms pauses

This makes applications feel more responsive, especially on devices with slow JS execution.

## Related

- [Mark-Sweep-Compact](./mark-sweep-compact.md) - Base algorithm
- [Scavenge Algorithm](./scavenge-algorithm.md) - Minor GC
- [Memory Leak Patterns](./memory-leak-patterns.md) - Common issues
