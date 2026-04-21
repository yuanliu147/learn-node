# Flame Graph Reading

## What is a Flame Graph?

A flame graph is a visualization of stack traces, showing which code paths consume the most CPU time. The x-axis represents population (time spent), and the y-axis represents stack depth.

## Structure

```
                            [root]
                              |
                          [module]
                              |
                    +--------+--------+
                    |                 |
               [func A]           [func B]
                    |                 |
              +----+----+        +----+----+
              |         |        |         |
          [leaf1]    [leaf2]  [leaf3]    [leaf4]
```

## Reading the Graph

### Key Principles

1. **Bottom-up reading**: Start from the leaves (top of stack) and work up
2. **Width matters**: Wider frames = more time spent
3. **Color coding**: 
   - Hot/CPU: Red/Orange
   - Cold: Yellow
   - Async: Purple

### Identifying Issues

**Look for:**
- Tall stacks with narrow tops (deep recursion)
- Wide stacks (parallel execution of expensive functions)
- Flat spots (blocking operations)

## Node.js Specific Patterns

### Synchronous Heavy

```
=== CPU ===
node::Module::compile
  node::Module::load
    node::Module::run
      require (native)
        YOUR_FUNCTION  ← Wide = hot
```

### Memory Intensive

```
=== Memory ===
node::Buffer::New
  YOUR_ALLOCATION
    YOUR_PROCESSING
```

## Generating Flame Graphs

### Using 0x

```bash
npx 0x app.js
```

### Using Clinic Flame

```bash
clinic flame -- node app.js
```

### Using perf (Linux)

```bash
perf record -F 99 -g -- node app.js
perf script > out.perf
```

## Interpreting Colors

| Color | Meaning | Action |
|-------|---------|--------|
| Red/Orange | Hot path | Optimize first |
| Yellow | Warm | Monitor |
| Blue | Cold/I/O wait | Usually low priority |

## Common Patterns to Identify

### 1. Hot Loop

```
handler()
  processItems()
    for loop ← Tall stack, wide
      heavyCalculation()
```

### 2. JSON Parsing

```
HTTP handler
  JSON.parse  ← Often hot
    parse engine
```

### 3. Regex Heavy

```
validate()
  RegExp.test  ← Multiple stacks
    native regex
```

## Best Practices

1. **Capture during realistic load**
2. **Generate multiple graphs for consistency**
3. **Compare before/after optimizations**
4. **Focus on tallest, widest frames first**

## Common Performance Killers

- Synchronous operations in request handlers
- Deep recursion without memoization
- Unoptimized JSON parsing
- Regex in hot paths
- Blocking I/O
