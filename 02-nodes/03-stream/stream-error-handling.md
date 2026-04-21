# Stream Error Handling in Node.js

Proper error handling is critical for stream reliability. Streams emit errors differently than regular callbacks.

## Error Event Basics

Streams are EventEmitters but errors don't propagate automatically:

```javascript
readable.on('error', (err) => {
  console.error('Readable error:', err);
});

writable.on('error', (err) => {
  console.error('Writable error:', err);
});
```

## Common Stream Errors

### ERR_STREAM_PREMATURE_CLOSE
Stream closed before completion:
```javascript
// Forgetting to handle errors
process.stdin.pipe(fs.createWriteStream('output'));
// If process.stdin errors, output file may be corrupted
```

### ERR_STREAM_PIPE_HUB
Attempting to pipe to multiple destinations:
```javascript
readable.pipe(writable1);
readable.pipe(writable2); // ERR_STREAM_PIPE_HUB
```

### ERR_MULTIPLE_CALLBACK
Callback called more than once:
```javascript
const transform = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk);
    callback(null, chunk); // ERR_MULTIPLE_CALLBACK
  }
});
```

## Error Propagation

### In Transforms

```javascript
const { Transform } = require('stream');

const safeTransform = new Transform({
  transform(chunk, encoding, callback) {
    try {
      const result = processChunk(chunk); // may throw
      callback(null, result);
    } catch (err) {
      callback(err); // Pass error to stream
    }
  }
});
```

### In Readables

```javascript
class MyReadable extends Readable {
  _read(size) {
    try {
      const data = fetchData();
      this.push(data);
    } catch (err) {
      this.destroy(err); // Clean destroy with error
    }
  }
}
```

## destroy() Method

Cleanly destroy streams:

```javascript
// Destroy with error
stream.destroy(new Error('Something went wrong'));

// Destroy without error
stream.destroy();

// Check if destroyed
stream.destroyed; // boolean
```

### destroy() Event

```javascript
stream.on('close', () => {
  console.log('Stream closed');
});

stream.on('error', (err) => {
  console.log('Stream error:', err);
});

stream.destroy();
```

## Error Handling Patterns

### Pattern 1: Individual Error Listeners

```javascript
const readable = getReadable();
const writable = getWritable();

readable.on('error', handleError);
writable.on('error', handleError);

readable.pipe(writable);
```

### Pattern 2: Using pipeline() (Recommended)

```javascript
const { pipeline } = require('stream');

pipeline(
  readable,
  writable,
  (err) => {
    if (err) {
      console.error('Pipeline failed:', err);
    } else {
      console.log('Pipeline succeeded');
    }
  }
);
```

### Pattern 3: Stream Finalization

```javascript
const { finished } = require('stream');

finished(readable, (err) => {
  if (err) {
    console.error('Readable ended with error:', err);
  }
});

finished(writable, (err) => {
  if (err) {
    console.error('Writable ended with error:', err);
  }
});
```

## Cleanup on Error

Always clean up resources:

```javascript
const stream = createStream();
const fileHandle = await openFile();

stream.on('error', async (err) => {
  await fileHandle.close();
  console.error(err);
});

stream.pipe(destination);
```

## AbortController Pattern

```javascript
const ac = new AbortController();

async function copyWithAbort() {
  try {
    await pipeline(
      fs.createReadStream('input'),
      fs.createWriteStream('output'),
      { signal: ac.signal }
    );
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('Operation cancelled');
    } else {
      throw err;
    }
  }
}

// Cancel after 5 seconds
setTimeout(() => ac.abort(), 5000);
```

## Preventing Orphaned Streams

```javascript
// Bad: stream left hanging on error
readable.pipe(writable);

// Good: cleanup all streams on error
function pipeWithCleanup(readable, writable) {
  const cleanup = () => {
    readable.destroy();
    writable.destroy();
  };
  
  readable.on('error', cleanup);
  writable.on('error', cleanup);
  
  return readable.pipe(writable);
}
```

## Error Events vs Callbacks

| Approach | Error Handling | Completion |
|----------|-----------------|------------|
| Event listeners | Manual | `end` event |
| pipeline() | Automatic via callback | Callback called |
| finished() | Manual | Callback called |
| promisified pipeline | Throws on rejection | Promise resolves |

## Best Practices

1. **Always add error listeners** to prevent unhandled exceptions
2. **Use pipeline()** for production stream connections
3. **Destroy streams** explicitly when done or on error
4. **Clean up resources** (files, sockets, handles) on errors
5. **Handle premature close** with proper cleanup
6. **Propagate errors** through transform chains via callback
7. **Use AbortController** for cancellable stream operations
