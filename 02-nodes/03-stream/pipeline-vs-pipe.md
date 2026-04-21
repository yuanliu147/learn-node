# pipeline() vs pipe() in Node.js

Both connect streams together, but with important differences in error handling and cleanup.

## pipe() Method

```javascript
readable.pipe(writable, { end: true });
```

### Characteristics
- Returns the destination stream
- Does NOT properly handle errors
- Does NOT clean up on errors
- If readable errors, writable may never close
- `end: true` (default) ends writable when readable ends

### Problems with pipe()

```javascript
// Problem: Error in readable doesn't clean up writable
readable.pipe(writable);

readable.on('error', (err) => {
  // writable is left hanging
  console.error(err);
});
```

## pipeline() Method

```javascript
const { pipeline } = require('stream');
const { promisify } = require('util');

pipeline(readable, writable, (err) => {
  if (err) {
    console.error('Pipeline failed:', err);
  }
});

// Or with promises (Node 10+)
const promisifiedPipeline = promisify(pipeline);
await promisifiedPipeline(readable, writable);
```

### Characteristics
- Returns the destination stream
- Properly forwards errors
- Calls `.destroy()` on all streams on error
- Properly ends all streams on success
- Provides callback with error info
- Promise support (Node 10+)

## Comparison Table

| Feature | pipe() | pipeline() |
|---------|--------|------------|
| Error handling | Manual | Automatic |
| Stream cleanup on error | No | Yes |
| Callback on completion | No | Yes |
| Promise support | No | Yes (Node 10+) |
| Multiple streams | No | Yes |

## Multiple Streams with pipeline()

```javascript
const { pipeline } = require('stream');

pipeline(
  fs.createReadStream('input.txt'),
  zlib.createGzip(),
  fs.createWriteStream('output.txt.gz'),
  (err) => {
    if (err) {
      console.error('Pipeline failed:', err);
    } else {
      console.log('Pipeline succeeded');
    }
  }
);
```

## Using pipeline() with Async Iterables

```javascript
const { pipeline } = require('stream');
const { finished } = require('stream');

async function copy(source, destination) {
  await new Promise((resolve, reject) => {
    pipeline(source, destination, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
```

## Recommendations

### Use pipeline() when:
- Building production systems
- Chaining multiple transforms
- Need proper error propagation
- Need callback/promise on completion
- Need cleanup on failure

### Use pipe() when:
- Quick scripts/prototypes
- Single read→write pair
- Manual error handling already implemented
- Node version < 10 (pipeline not available)

## finished() Helper

For cases where you just need to know when a stream is done:

```javascript
const { finished } = require('stream');

finished(readable, (err) => {
  console.log('Stream finished:', err);
});
```
