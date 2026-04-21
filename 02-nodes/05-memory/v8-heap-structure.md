# V8 Heap Structure

## Architectural Overview

V8's heap architecture reflects fundamental trade-offs in memory management: throughput vs. pause time, memory footprint vs. allocation speed, and GC complexity vs. correctness. Understanding *why* the heap is structured this way informs how we write memory-efficient code.

## Design Philosophy

### The Generational Hypothesis

The heap's core architectural decision stems from an empirical observation: **most objects die young**.

```
Allocation Rate:  ────────────────────────────────
                  ████████                       (young)
                  ████████████████               (older)
                  ████████████████████████████████ (old)

Time:            0 ────────────────────────────────→

Reality: ~90% of objects become unreachable within milliseconds
```

This hypothesis, validated by production profiling at Google, justifies the **generational layout**: frequent, cheap collections on young objects + infrequent, expensive collections on old objects.

### Space Separation as Architectural Pattern

V8 doesn't use a flat heap—it partitions memory into specialized spaces, each optimized for specific object lifetimes and access patterns:

| Space | Architectural Rationale |
|-------|---------------------------|
| **New Space** | Fast allocation via bump-pointer; simple evacuation; minimal fragmentation |
| **Old Space** | Optimized for density over speed; supports mark-sweep-compact |
| **Large Object Space** | Bypasses page fragmentation constraints; never moved (compaction infeasible) |
| **Code Space** | Write-protected executable memory; separation enables security hardening |
| **Map Space** | Pointer stability required for hidden class identity; isolated for fast lookup |

## Heap Regions Deep Dive

### Young Generation (New Space)

**Architecture**: Semi-space collector design with two equal halves (From-Space / To-Space).

```
Allocation:                    Evacuation:
┌─────────────────┐           ┌─────────────────┐
│   From-Space    │  ──────→  │   To-Space      │
│   (live objects)│   minor   │   (survivors)   │
│                 │    GC     │                 │
└─────────────────┘           └─────────────────┘
         ↑                              │
         └──────────────────────────────┘
              (survivors ≥ age threshold)
```

**Why semi-space?** Simplicity: single pass copying, no fragmentation, predictable performance. Cost: 50% memory overhead during collection.

**Design constraints**:
- Size: 1-8 MB (configurable via `--max-new-space-size`)
- Collection: Stop-the-world Scavenge, typically < 1ms
- Survival tracking: age counter, promoted to Old Space after 2 minor GCs

### Old Generation (Old Space)

**Architecture**: Mark-Sweep-Compact collector, optimized for memory density.

```
Mark Phase:      Sweep Phase:       Compact Phase:
   ○ ○ ○          ○   ○              ○○○○○
   ○   ○    →     ○   ○     →        ○○○○○
   ○   ○          ○   ○              ○○○○○
   
   (live = marked)  (dead = swept)   (moved + defragmented)
```

**Why compact?** External fragmentation would eventually cause allocation failures despite sufficient total memory.

**Design constraints**:
- Default: 50MB to >1GB (`--max-old-space-size`)
- Major GC triggered on allocation failure
- Longer pause times (100ms+) acceptable for rare events

### Large Objects Space

**Architecture**: Objects >1MB bypass normal allocator entirely.

```
Normal Allocation:              Large Object:
page ← object ← object          large_object_space ← object (direct)
page ← object ← object          
page ← object          VS        (never moved, never compacted)
page ← object
```

**Why separate?** Moving 1MB+ objects is expensive; fragmentation in this space doesn't affect normal allocation.

**Trade-off**: No compaction → potential fragmentation over time.

### Code Space

**Architecture**: Write-protected, executable memory region.

```
┌─────────────────────────────────────┐
│          Code Space                 │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │
│  │ JIT │ │ JIT │ │ JIT │ │ JIT │  │
│  │func1│ │func2│ │func3│ │func4│  │
│  └─────┘ └─────┘ └─────┘ └─────┘  │
│   executable (rx)                  │
└─────────────────────────────────────┘
```

**Why write-protected?** Security: JIT code shouldn't be modifiable after creation (mitigates exploits).

### Map Space

**Architecture**: All `Map` objects (hidden classes) stored separately for pointer stability.

```
Map Space:
┌────┬────┬────┬────┬────┬────┐
│MapA│MapB│MapC│MapD│MapE│... │
└────┴────┴────┴────┴────┴────┘
  │    │    │
  │    │    └── Shape: {x, y, z}
  │    └── Shape: {x, y}
  └── Shape: {x}

Code references Map → Map determines object shape
```

**Why isolated?** Map identity matters for property access optimization. If Maps moved during compaction, every object using that Map would need pointer updates.

## Memory Allocation Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     ALLOCATION DECISION TREE                 │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ object size >   │
                    │ LARGE_OBJECT    │
                    │ THRESHOLD?      │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
           YES                             NO
              │                             │
              ▼                             ▼
    ┌─────────────────┐          ┌─────────────────┐
    │  Large Object   │          │  New Space has   │
    │     Space       │          │   room?          │
    └─────────────────┘          └────────┬────────┘
                                          │
                               ┌──────────┴──────────┐
                               ▼                     ▼
                            YES                      NO
                               │                      │
                               ▼                      ▼
                     ┌─────────────────┐    ┌─────────────────┐
                     │ Bump pointer    │    │ Minor GC        │
                     │ allocation in   │    │ (Scavenge)      │
                     │ From-Space      │    └────────┬────────┘
                     └─────────────────┘             │
                                         ┌───────────┴───────────┐
                                         ▼                       ▼
                                    Survivors?              Evacuation
                                         │                   fails
                                         ▼                       │
                               ┌─────────────────┐              │
                               │ To-Space or     │              ▼
                               │ Old Space       │    ┌─────────────────┐
                               └────────┬────────┘    │ Major GC        │
                                        │             └────────┬────────┘
                                        ▼                      │
                               ┌─────────────────┐              │
                               │ Old Space has   │              │
                               │ room?           │              │
                               └────────┬────────┘              │
                                        │                       │
                               ┌─────────┴─────────┐            │
                               ▼                   ▼            ▼
                           YES                   NO       Fatal: OOM
                               │                   │
                               ▼                   ▼
                     ┌─────────────────┐  ┌─────────────────┐
                     │ Allocate in     │  │ Process limit   │
                     │ Old Space       │  │ reached?        │
                     └─────────────────┘  └────────┬────────┘
                                                   │
                                      ┌────────────┴────────────┐
                                      ▼                         ▼
                                   YES                        NO
                                      │                         │
                                      ▼                         ▼
                            ┌─────────────────┐       ┌─────────────────┐
                            │ Throw OOM /     │       │ Grow heap and    │
                            │ GC cycle limit  │       │ retry            │
                            └─────────────────┘       └─────────────────┘
```

## Architectural Trade-offs

### Memory vs. Pause Time

```
Pause Time:
    │
    │                    ████
    │        ████       ██████      ████
    │  ████ ██████     ████████    ██████
    │ ████████████████████████████████
    └────────────────────────────────────→ Heap Size

Minor GC: ~0.5-1ms (constant, regardless of heap)
Major GC: O(heap) - grows with heap size
```

**Key insight**: Generational design bounds pause times. Application responsiveness depends on young generation fits in pause budget.

### Fragmentation Management

| Strategy | Pros | Cons |
|----------|------|------|
| **Mark-Sweep** | Fast mark, simple | Fragmentation accumulates |
| **Mark-Compact** | No fragmentation | Copying overhead |
| **Semi-Space** | Simple, predictable | 50% memory overhead |

V8 uses all three: Mark-Sweep for Old Space (speed), Mark-Compact when fragmentation exceeds threshold, Semi-Space for New Space.

## Heap Limits Architecture

V8 enforces memory limits as a **safety net**, not a target:

```javascript
// Default limits (architectural constraints)
32-bit: ~1.4GB heap limit
64-bit: ~3.5GB heap limit

// Why limits? Prevents single process from consuming entire system
// Allows OS to keep memory available for other processes
```

```
Memory Pressure Response:
                          
Low Pressure              High Pressure
     │                         │
     ▼                         ▼
┌─────────┐              ┌─────────┐
│ Lazy    │              │ Aggres- │
│ marking │              │ sive GC │
└─────────┘              └─────────┘
     │                         │
     ▼                         ▼
  Normal                   Aggressive
  collection               promotion to
                          old space
```

## Monitoring Architecture

```javascript
// v8.getHeapStatistics() maps to internal heap spaces
const v8 = require('v8');
const stats = v8.getHeapStatistics();

console.log({
  // Space-specific metrics
  total_heap_size: stats.total_heap_size,           // All spaces combined
  used_heap_size: stats.used_heap_size,             // Live data
  
  // New Space metrics (not directly exposed, inferred from deltas)
  // young_space_size: ~1-8MB configured
  
  // Memory allocator metrics
  malloced_memory: stats.malloced_memory,           // Native allocations
  peak_malloced_memory: stats.peak_malloced_memory,
  
  // Limit info
  heap_size_limit: stats.heap_size_limit,           // ~3.5GB on 64-bit
});
```

## Architecture-Informed Coding

**Why this matters for application architecture**:

1. **Object lifetime design**: Align object lifetime with heap region characteristics
   - Short-lived: New Space (fast allocation, cheap collection)
   - Long-lived: Old Space (avoid frequent minor GC)

2. **Cache architecture**: Understanding promotion helps design effective caches
   - Cache entries that survive 2 minor GCs get promoted to Old Space
   - Unbounded caches = unbounded Old Space growth

3. **Memory limit planning**: Knowing limits informs `--max-old-space-size` tuning
   - I/O-bound services: Larger heap (more buffering)
   - CPU-bound services: Smaller heap (faster GC cycles)

## Related

- [Scavenge Algorithm](./scavenge-algorithm.md) - Minor GC architecture
- [Mark-Sweep-Compact](./mark-sweep-compact.md) - Major GC architecture
- [Memory Leak Patterns](./memory-leak-patterns.md) - How leaks exploit this architecture
