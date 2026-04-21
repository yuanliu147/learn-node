# Backpressure Mechanism in Node.js Streams

Backpressure is the mechanism that prevents a faster writable stream from overwhelming a slower readable stream.

## The Problem

When a readable source produces data faster than a writable destination can consume:
- Memory usage grows unbounded
- Data may be lost
- System becomes unresponsive

## How Backpressure Works

### Writable Stream Buffering

Writable streams have a `highWaterMark` (default 16KB):
- `write()` returns `true` while buffer is below threshold
- Returns `false` when buffer exceeds threshold

### The Drain Cycle

```
Readable produces data → Writable write() returns false → Readable pauses → Writable drains → 'drain' event → Readable resumes
```

## Implementation Pattern

```javascript
const readable = getReadableSource();
const writable = getWritableDest();

readable.on('data', (chunk) => {
  const canContinue = writable.write(chunk);
  
  if (!canContinue) {
    // Stop reading, wait for drain
    readable.pause();
    
    writable.once('drain', () => {
      readable.resume();
    });
  }
});
```

## Using pipe() for Automatic Backpressure

`pipe()` automatically handles backpressure:

```javascript
readable.pipe(writable);
// Backpressure is managed internally
```

## Transform Streams and Backpressure

Transform streams pass through backpressure:
```javascript
readable
  .pipe(transform1)
  .pipe(transform2)
  .pipe(writable);
```

If `writable` signals backpressure, it propagates back through the transform chain.

## High Water Mark

- **Readable streams**: `highWaterMark` = 16KB default (objectMode: -1)
- **Writable streams**: `highWaterMark` = 16KB default
- **File streams**: `highWaterMark` = 64KB

Setting buffer size:
```javascript
const stream = createReadStream(file, { highWaterMark: 64 * 1024 });
```

## Recognizing Backpressure

Signs backpressure is occurring:
- `write()` returns `false` frequently
- Memory usage is stable despite high throughput
- CPU usage on drain events

## Best Practices

1. Always respect backpressure signals
2. Use `pipe()` when possible (handles it automatically)
3. When manually handling, always wait for `drain` before resuming
4. Monitor `write()` return values in event handlers
