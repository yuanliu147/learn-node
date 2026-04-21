# pipeline() vs pipe() in Node.js

> **Architecture Perspective**: `pipe()` and `pipeline()` represent two different **resource management philosophies**: minimal overhead vs. production resilience. The choice is an architectural decision about who owns error propagation and cleanup.

## The Fundamental Difference

| Aspect | `pipe()` | `pipeline()` |
|--------|----------|--------------|
| Error propagation | Silent failure | Explicit callback/destroy |
| Resource cleanup on error | ❌ Leaks streams | ✅ Destroys all streams |
| Multiple stream chain | ❌ Only 2 streams | ✅ N streams |
| Completion signal | ❌ None | ✅ Callback / Promise |
| Production readiness | ⚠️ Requires manual guards | ✅ Built-in |

## pipe(): Minimal, Fragile Composition

```javascript
readable.pipe(writable, { end: true });
```

### What pipe() Does

- Connects readable → writable
- Returns the **destination** stream
- `end: true` (default): ends writable when readable ends

### What pipe() Does NOT Do

```
readable ──▶ writable

If readable.errors ──▶ writable is left open (memory leak)
If writable.errors ──▶ readable continues reading into void
```

**This is the core architectural weakness**: `pipe()` assumes both endpoints are well-behaved and eternal. In production, either endpoint can fail.

### The Failure Mode

```javascript
readable.pipe(writable);
// Problem: readable error leaves writable hanging

readable.on('error', (err) => {
  // writable never closed, port/socket leaked
  console.error(err);
});
```

**Architectural consequence**: `pipe()` requires manual error handling on both ends. Every `pipe()` site needs:

```javascript
readable.pipe(writable);

readable.on('error', (err) => {
  writable.destroy(); // clean up partner
});

writable.on('error', (err) => {
  readable.destroy(); // stop reading
});
```

This boilerplate is error-prone and often forgotten.

## pipeline(): Production-Grade Composition

```javascript
const { pipeline } = require('stream');

pipeline(
  readable,
  transform1,
  transform2,
  writable,
  (err) => {
    if (err) {
      console.error('Pipeline failed:', err);
    }
    // All streams destroyed, resources freed
  }
);
```

### What pipeline() Does

- Connects N streams in sequence
- **Forwards errors** from any stream to the callback
- **Destroys all streams** in the chain on any error
- **Properly ends** all streams on success
- Returns the destination stream (like `pipe()`)

### Error Flow in pipeline()

```
readable ──▶ transform1 ──▶ transform2 ──▶ writable

If transform2.errors:
  1. Error propagates to callback
  2. readable.destroy() called
  3. transform1.destroy() called
  4. transform2.destroy() called
  5. writable.destroy() called
  6. Callback invoked with error
```

**All resources released. No leaks.**

### Promise Support (Node 10+)

```javascript
const { pipeline } = require('stream');
const { promisify } = require('util');

const pipe = promisify(pipeline);

// async/await style
async function processFile(input, output) {
  await pipe(
    fs.createReadStream(input),
    zlib.createGzip(),
    fs.createWriteStream(output)
  );
  // OR
  return new Promise((resolve, reject) => {
    pipeline(readable, writable, (err) => err ? reject(err) : resolve());
  });
}
```

## Architectural Comparison

### Error Handling Model

```
pipe():
  readable ──▶ writable
       │            │
       ▼            ▼
   error out    error out
   (separate   (separate
    handlers)    handlers)
   ❌ No coordination between handlers

pipeline():
  readable ──▶ transform ──▶ writable
       │            │           │
       └────────────┴───────────┘
              │
              ▼
         single callback
         with full error
         + stream cleanup
```

**Decision**: `pipeline()` centralizes error handling — a single callback receives all errors and the cleanup is automatic. This is the **observer pattern** applied to stream composition.

### Resource Lifecycle Ownership

| Lifecycle Event | `pipe()` | `pipeline()` |
|-----------------|----------|--------------|
| Success complete | Writable ended (if `end: true`) | All streams ended |
| Readable error | Writable left open ⚠️ | All streams destroyed |
| Writable error | Readable continues ⚠️ | All streams destroyed |
| Unexpected close | No cleanup | All streams destroyed |

## When to Use Each

### Use `pipe()` when:

```javascript
// Scenario: Simple, short-lived, well-controlled
// Example: one-off file copy in a script
fs.createReadStream('input.txt').pipe(fs.createWriteStream('output.txt'));

// The streams are:
  // - Both local, trusted objects
  // - Guaranteed to complete
  // - No external consumers that could error
  // - Error handled at a higher level (process-level)
```

**Architecture**: Acceptable for internal scripts, not for services handling real traffic.

### Use `pipeline()` when:

```javascript
// Scenario: Production service handling I/O
// Example: HTTP response streaming with compression
const { pipeline } = require('stream');
const { createGzip } = require('zlib');

pipeline(
  fs.createReadStream(filePath),
  createGzip(),
  response,  // HTTP response writable
  (err) => {
    if (err) {
      console.error('Streaming failed', err);
      // response.destroy() called automatically
      // fs stream destroyed automatically
    }
    // Resources always released
  }
);

// Scenario: Multiple transforms
pipeline(
  request,
  authenticate,
  validate,
  transform,
  respond,
  (err) => { /* cleanup */ }
);
```

**Architecture**: Mandatory for any chain longer than 2 streams, any production I/O, any scenario where external clients are involved.

## Async Iterables Integration (Node 12+)

`pipeline()` accepts async iterables as source or destination:

```javascript
const { pipeline } = require('stream');

async function* generateChunks() {
  for await (const row of db.query('SELECT * FROM large_table')) {
    yield JSON.stringify(row);
  }
}

await pipeline(
  generateChunks(),
  createTransformStream(),
  fs.createWriteStream('output.jsonl')
);
// Backpressure works through the async iterator protocol
```

**Architecture**: `pipeline()` bridges push (streams) and pull (async iterables) models — critical for mixing DB queries, file I/O, and HTTP streams.

## finished() Helper: Lifecycle Observation Without Composition

When you just need to observe stream completion without composing:

```javascript
const { finished } = require('stream');

finished(readable, (err) => {
  // Called whether stream ended, errored, or was destroyed
  console.log('Readable lifecycle ended:', err);
});
```

**Use case**: Integration with external libraries that manage their own streams, or logging/metrics on stream lifecycle.

## Decision Matrix

| Criterion | `pipe()` | `pipeline()` |
|-----------|----------|--------------|
| Production HTTP handlers | ❌ | ✅ |
| File processing pipelines | ❌ | ✅ |
| Simple scripts | ✅ | ✅ |
| Streams < 2 hops | ✅ | ✅ |
| External/untrusted streams | ❌ | ✅ |
| Need Promise/async-await | ❌ | ✅ |
| Error-safe composition | ❌ | ✅ |

**Rule**: Default to `pipeline()`. Drop to `pipe()` only when you have a single, controlled read→write pair and Node < 10.

## Anti-Patterns

```javascript
// ❌ pipe() in production without error handling
readable.pipe(writable);

// ✅ Explicit errors, explicit cleanup
readable.pipe(writable);
readable.on('error', (err) => writable.destroy());
writable.on('error', (err) => readable.destroy());

// ✅ pipeline() — automatic
pipeline(readable, writable, (err) => {
  if (err) console.error(err);
});

// ❌ pipe() with multiple transforms — error leaks
readable.pipe(t1).pipe(t2).pipe(writable);
// t1 error → t2 and writable leak

// ✅ pipeline() with multiple transforms
pipeline(readable, t1, t2, writable, (err) => { /* all cleaned up */ });
```

**The architectural lesson**: `pipeline()` is not just `pipe()` with a callback. It is a **different contract** — one where the system owns resource cleanup, not the caller.
