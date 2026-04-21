# V8 Heap Structure

## Overview

V8's heap is divided into several regions, each serving specific purposes in memory management. Understanding the heap structure is essential for debugging memory issues and optimizing application performance.

## Heap Regions

### Young Generation (New Space)
- **Size**: Typically 1-8 MB (configurable via `--min-old-space-size` and `--max-new-space-size`)
- **Purpose**: Stores short-lived objects
- **Structure**: Divided into two equal halves (From-Space and To-Space)
- **Collection**: Minor GC (Scavenge) collects this region frequently

### Old Generation (Old Space)
- **Size**: Configurable, default ranges from 50MB to over 1GB
- **Purpose**: Stores objects that survived at least one minor GC
- **Collection**: Major GC (Mark-Sweep-Compact) when old space allocation fails

### Large Objects Space
- **Purpose**: Objects larger than the page size (~1MB) are allocated here directly
- **Characteristics**: Never moved by compaction; can contain objects larger than available contiguous space

### Code Space
- **Purpose**: Stores compiled executable code (JIT compiled functions)
- **Characteristics**: Write-protected and executable; contains the actual machine code

### Cell Space & Property Cell Space
- **Purpose**: Stores objects with fixed-size elements
- **Characteristics**: Contains cells with pointers to objects or raw data values

### Property Cell Space
- **Purpose**: Holds property cells containing Smi (Small Integer) values

### Map Space
- **Purpose**: Stores Map objects (internal hidden class structures)
- **Characteristics**: All maps are stored here to ensure pointer stability

## Heap Spaces Summary

| Space | Young/Old | Purpose |
|-------|-----------|---------|
| New Space | Young | Short-lived objects |
| Old Space | Old | Long-lived objects |
| Large Object Space | Old | Objects > 1MB |
| Code Space | Old | Compiled JIT code |
| Cell Space | Old | Fixed-size cells |
| Property Cell Space | Old | Property cells |
| Map Space | Old | Hidden classes (Maps) |

## Memory Allocation Flow

```
1. New object allocation → New Space (From-Space)
2. Survives minor GC → Moved to New Space (To-Space) or Old Space
3. Old Space full → Major GC triggered
4. Large allocation → Large Object Space directly
5. Map creation → Map Space
```

## Heap Limits

V8 enforces memory limits to prevent excessive memory consumption:
- **Default heap limit**: ~1.4GB (32-bit) / ~3.5GB (64-bit)
- **Configurable via flags**: `--max-old-space-size`, `--max-new-space-size`
- **Memory pressure detection**: V8 monitors heap growth and triggers GC accordingly

## Key Concepts

### Heap Layout
- **Generational layout**: Most objects die young; generational hypothesis
- **Remembered Set**: Tracks references from old to young generation (for minor GC)
- **Card Table**: Used for incremental marking and remembered set tracking

### Heap Statistics
```javascript
// Access heap statistics via v8 getHeapStatistics
const v8 = require('v8');
console.log(v8.getHeapStatistics());
```

Output includes:
- `total_heap_size`: Current heap size
- `used_heap_size`: Used portion
- `heap_size_limit`: Maximum allowed heap
- `malloced_memory`: Memory allocated via malloc
- `peak_malloced_memory`: Peak malloc'd memory

## Related

- [Scavenge Algorithm](./scavenge-algorithm.md) - Minor GC details
- [Mark-Sweep-Compact](./mark-sweep-compact.md) - Major GC details
- [Memory Leak Patterns](./memory-leak-patterns.md) - Common issues
