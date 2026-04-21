# Clinic.js Workflow

## Overview

Clinic.js is a diagnostic tool for Node.js applications that helps identify performance issues through profiling. It provides three main tools: Doctor, Flame, and Bubbleprof.

## Installation

```bash
npm install -g clinic
```

## Tools Overview

### 1. Clinic Doctor

Detects health issues and provides recommendations.

```bash
clinic doctor -- node server.js
```

**Detects:**
- Event loop lag
- Active handles/requests
- Memory usage patterns
- CPU usage

### 2. Clinic Flame

Generates flame graphs for CPU profiling.

```bash
clinic flame -- node server.js
```

**Use cases:**
- Identifying hot code paths
- Finding functions consuming most CPU time
- Analyzing synchronous operations

### 3. Clinic Bubbleprof

Visualizes async operations and latency.

```bash
clinic bubbleprof -- node server.js
```

**Tracks:**
- Async operations timing
- Event loop delays
- Operation dependencies

## Workflow Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    Development Cycle                        │
├─────────────────────────────────────────────────────────────┤
│  1. Run with Clinic    →    2. Analyze Output              │
│         ↓                            ↓                      │
│  3. Identify Issue     ←    4. Get Recommendations         │
│         ↓                                                    │
│  5. Optimize Code      →    6. Re-profile                   │
└─────────────────────────────────────────────────────────────┘
```

## Best Practices

1. **Profile in production-like environment**
2. **Capture during actual load conditions**
3. **Compare before/after measurements**
4. **Focus on highest impact issues first**

## Example Workflow

```bash
# Start profiling
clinic doctor -- node app.js

# Generate report
clinic flame -- node app.js

# Open visualizer
clinic visualize --output flame.svg
```

## Interpreting Results

| Tool | Primary Metric | Action For |
|------|----------------|------------|
| Doctor | Health score | General diagnostics |
| Flame | CPU time | Synchronous bottlenecks |
| Bubbleprof | Async delays | I/O coordination issues |

## Exit Codes

- `0`: Successful completion
- `1`: Issues detected (warnings)
- `2`: Critical errors found
