# Mark-Sweep-Compact (Major GC)

## Overview

Mark-Sweep-Compact is V8's major garbage collection algorithm for the old generation. Unlike Scavenge, it's designed to handle long-lived objects and reclaim memory efficiently while reducing fragmentation.

## Three-Phase Process

### Phase 1: Mark

**Objective**: Identify all reachable (live) objects

#### Marking Algorithm
```
1. Start with root set (globals, stack, handles)
2. Add roots to mark stack
3. While mark stack not empty:
   a. Pop object from stack
   b. If not already marked:
      - Mark object as live
      - Add all its references to stack
4. At end: all reachable objects are marked
```

#### Marking Techniques

**Tri-color Marking (Incremental GC foundation)**
- **White**: Unvisited (candidate for collection)
- **Grey**: Visited, references not yet scanned
- **Black**: Visited, references fully scanned

```
Invariant: No black object references a white object
```

#### Bitmap Marking
- Uses a separate bitmap to track marked objects
- One bit per object slot
- Efficient for sparse marking

#### Write Barrier
During marking, a write barrier ensures mutator (JS code) doesn't violate tri-color invariant:
```javascript
// When writing a reference:
if (old_value_in_heap && !new_value_in_heap) {
    // Potential old→new reference, might need barrier
}
```

### Phase 2: Sweep

**Objective**: Reclaim memory from unmarked objects

#### Sweep Process
```
1. Iterate through heap pages
2. For each unmarked object:
   - Add its memory to free list
   - Record size in free list
3. Result: Free list with all dead objects' space
```

#### Free List Organization
- **Size-segregated lists**: Objects of similar sizes grouped
- **First-fit allocation**: Find first block large enough
- Reduces fragmentation compared to simple list

### Phase 3: Compact

**Objective**: Eliminate fragmentation by moving objects

#### Compaction Process
```
1. Calculate new addresses for objects
2. Update all references to moved objects
3. Move objects to new addresses
4. Update all internal pointers
```

#### Sliding Compaction
```
Before: [A(D)] [live] [B(D)] [live] [C(D)] [live]
                 ↓ slide
After:  [live] [live] [live] [   free   ]
```

#### Compaction Options

**Full Compaction**
- Maximum fragmentation reduction
- Higher GC pause time
- Used when fragmentation is severe

**Incremental Compaction**
- Partial compaction in steps
- Lower pause times spread over time
- Default for interactive applications

## Heap Organization

### Page Structure
```
┌─────────────────────────────────────────────────┐
│ Page Header (metadata)                          │
├─────────────────────────────────────────────────┤
│ Object Area                                     │
│ [Map] [Object 1] [Object 2] [Object 3] ...      │
├─────────────────────────────────────────────────┤
│ Compaction Space (temporary during GC)         │
└─────────────────────────────────────────────────┘
```

### Large Objects
- Not compacted (too expensive to move)
- May have own free list entry
- Can cause fragmentation over time

## Mark-Compact vs Mark-Sweep

| Aspect | Mark-Sweep | Mark-Compact |
|--------|------------|--------------|
| Fragmentation | Yes (free gaps) | No (compacted) |
| Allocation Speed | Slower (free list search) | Faster (bump pointer after compact) |
| GC Pause | Shorter | Longer |
| Memory Overhead | Lower | Higher (forwarding pointers) |

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Pause Time | 10-100ms+ (depends on heap size) |
| Frequency | When old space allocation fails |
| Throughput | Good for long-lived objects |

## Marking Optimizations

### 1. Incremental Marking
- Mark in small steps between JS execution
- Requires write barrier to maintain correctness
- Reduces pause time but increases total marking time

### 2. Parallel Marking
- Multiple threads mark simultaneously
- Work-stealing for load balancing
- Significant speedup on multi-core

### 3. Lazy Sweeping
- Defer sweeping until allocation needed
- Reduces pause time
- May delay reclamation

## Memory Layout After Full GC

```
Old Space (after compaction):
┌─────────────────────────────────────────────────┐
│ [live] [live] [live] [live]        [free space]  │
└─────────────────────────────────────────────────┘
```

## Configuration

```bash
# Disable compaction (not recommended)
node --no-compaction

# Adjust heap margin
node --heap-margin=1024  # MB

# Force GC before heap limit
node --gc-interval=100
```

## Related

- [V8 Heap Structure](./v8-heap-structure.md) - Heap organization
- [Scavenge Algorithm](./scavenge-algorithm.md) - Minor GC
- [Incremental-Concurrent-GC](./incremental-concurrent-gc.md) - Optimized GC
