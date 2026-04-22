# V8 堆结构

## 架构概述

V8 的堆架构反映了内存管理中的基本权衡：吞吐量 vs 暂停时间、内存占用 vs 分配速度、GC 复杂度 vs 正确性。理解*为什么*堆以这种方式结构化，有助于了解如何编写内存高效代码。

## 设计理念

### 分代假说

堆的核心架构决策源于一个经验观察：**大多数对象死得早**。

```
分配率:  ────────────────────────────────
                  ████████                       (young)
                  ████████████████               (older)
                  ████████████████████████████████ (old)

时间:            0 ────────────────────────────────→

现实: 约 90% 的对象在毫秒内变得不可达
```

这个假说，谷歌生产环境分析验证，使**分代布局**变得合理：年轻对象频繁、廉价的收集 + 老年对象不频繁、昂贵的收集。

### 空间分离作为架构模式

V8 不使用平坦堆——它将内存分区为专门的空间，每个都针对特定的对象生命周期和访问模式优化：

| 空间 | 架构理由 |
|------|---------|
| **New Space** | 通过 bump-pointer 快速分配；简单晋升；最小碎片化 |
| **Old Space** | 针对密度而非速度优化；支持 mark-sweep-compact |
| **Large Object Space** | 绕过页面碎片化约束；永不移动（压缩不可行） |
| **Code Space** | 写保护可执行内存；分离实现安全加固 |
| **Map Space** | 隐藏类身份需要指针稳定性；隔离实现快速查找 |

## 堆区域深入解析

### 年轻代（New Space）

**架构**：双半空间设计（From-Space / To-Space）。

```
分配:                    晋升:
┌─────────────────┐           ┌─────────────────┐
│   From-Space    │  ──────→  │   To-Space      │
│   (live objects)│   minor   │   (survivors)   │
│                 │    GC     │                 │
└─────────────────┘           └─────────────────┘
         ↑                              │
         └──────────────────────────────┘
              (survivors ≥ age threshold)
```

**为什么半空间？** 简单：单遍复制，无碎片化，可预测性能。代价：收集期间 50% 内存开销。

**设计约束**：
- 大小：1-8 MB（可通过 `--max-new-space-size` 配置）
- 收集：Stop-the-world Scavenge，通常 < 1ms
- 存活追踪：年龄计数器，2 次 minor GC 后晋升到 Old Space

### 老年代（Old Space）

**架构**：Mark-Sweep-Compact 收集器，针对内存密度优化。

```
Mark 阶段:      Sweep 阶段:       Compact 阶段:
   ○ ○ ○          ○   ○              ○○○○○
   ○   ○    →     ○   ○     →        ○○○○○
   ○   ○          ○   ○              ○○○○○
   
   (live = marked)  (dead = swept)   (moved + defragmented)
```

**为什么压缩？** 外部碎片化最终会导致尽管总内存充足但分配失败。

**设计约束**：
- 默认：50MB 到 >1GB（`--max-old-space-size`）
- Major GC 在分配失败时触发
- 更长的暂停时间（100ms+）对稀有事件可接受

### 大对象空间

**架构**：对象 >1MB 完全绕过正常分配器。

```
Normal Allocation:              Large Object:
page ← object ← object          large_object_space ← object (direct)
page ← object ← object          
page ← object          VS        (never moved, never compacted)
page ← object
```

**为什么分离？** 移动 1MB+ 对象代价高昂；这个空间中的碎片化不影响正常分配。

**权衡**：无压缩 → 随着时间推移可能碎片化。

### Code Space

**架构**：写保护、可执行内存区域。

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

**为什么写保护？** 安全：JIT 代码创建后不应可修改（减少漏洞利用）。

### Map Space

**架构**：所有 `Map` 对象（隐藏类）分开存储以保证指针稳定性。

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

**为什么隔离？** Map 身份对属性访问优化很重要。如果 Map 在压缩期间移动，使用该 Map 的每个对象都需要指针更新。

## 内存分配流

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

## 架构权衡

### 内存 vs 暂停时间

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

**关键洞察**：分代设计限制暂停时间。应用响应性取决于年轻代是否适合暂停预算。

### 碎片化管理

| 策略 | 优点 | 缺点 |
|------|------|------|
| **Mark-Sweep** | 快速标记，简单 | 碎片化累积 |
| **Mark-Compact** | 无碎片化 | 复制开销 |
| **Semi-Space** | 简单，可预测 | 50% 内存开销 |

V8 三种都用：Old Space 用 Mark-Sweep（速度），碎片化超过阈值时用 Mark-Compact，New Space 用 Semi-Space。

## 堆限制架构

V8 将内存限制作为**安全网**，而非目标：

```javascript
// 默认限制（架构约束）
32-bit: ~1.4GB heap limit
64-bit: ~3.5GB heap limit

// 为什么限制？防止单个进程消耗整个系统
// 允许 OS 为其他进程保持内存可用
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

## 监控架构

```javascript
// v8.getHeapStatistics() 映射到内部堆空间
const v8 = require('v8');
const stats = v8.getHeapStatistics();

console.log({
  // 空间特定指标
  total_heap_size: stats.total_heap_size,           // 所有空间合计
  used_heap_size: stats.used_heap_size,             // 活数据
  
  // New Space 指标（不直接暴露，从增量推断）
  // young_space_size: ~1-8MB configured
  
  // 内存分配器指标
  malloced_memory: stats.malloced_memory,           // 原生分配
  peak_malloced_memory: stats.peak_malloced_memory,
  
  // 限制信息
  heap_size_limit: stats.heap_size_limit,           // 64 位上约 3.5GB
});
```

## 架构指导编码

**这对应用架构为什么重要**：

1. **对象生命周期设计**：使对象生命周期与堆区域特征对齐
   - 短生命周期：New Space（快速分配，廉价收集）
   - 长生命周期：Old Space（避免频繁 minor GC）

2. **缓存架构**：理解晋升有助于设计有效缓存
   - 存活 2 次 minor GC 的缓存条目被晋升到 Old Space
   - 无界缓存 = 无界 Old Space 增长

3. **内存限制规划**：了解限制告知 `--max-old-space-size` 调优
   - I/O 密集型服务：更大堆（更多缓冲）
   - CPU 密集型服务：更小堆（更快 GC 周期）

## 相关

- [Scavenge 算法](./scavenge-algorithm.md) - Minor GC 架构
- [Mark-Sweep-Compact](./mark-sweep-compact.md) - Major GC 架构
- [内存泄漏模式](./memory-leak-patterns.md) - 泄漏如何利用此架构
