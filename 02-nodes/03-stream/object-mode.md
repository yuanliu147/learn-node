# Object Mode in Node.js Streams

Object mode allows streams to work with JavaScript objects instead of Buffer/string data.

## Enabling Object Mode

```javascript
// Readable in object mode
const readable = Readable.from([
  { name: 'Alice', age: 25 },
  { name: 'Bob', age: 30 }
], { objectMode: true });

// Transform in object mode
const transform = new Transform({
  objectMode: true,
  transform(chunk, encoding, callback) {
    // chunk is an object, not a Buffer
    callback(null, { ...chunk, processed: true });
  }
});

// Both sides must agree on mode for piping
readable.pipe(transform); // Works if both objectMode: true
```

## Object Mode Characteristics

### No Buffering
- Cannot use `highWaterMark` for byte sizing
- Instead counts number of objects
- Default `objectMode: true` highWaterMark = 16 objects

### Type Changes
- `write()` receives objects instead of strings/buffers
- `read(size)` returns objects instead of chunks
- Chunks are NOT encoded/decoded

## Common Use Cases

### Processing Records

```javascript
const { Transform } = require('stream');

const batcher = new Transform({
  objectMode: true,
  transform(chunk, encoding, callback) {
    this.push({
      id: chunk.id,
      data: JSON.stringify(chunk.data)
    });
    callback();
  }
});
```

### Filtering

```javascript
const filterStream = new Transform({
  objectMode: true,
  transform(record, encoding, callback) {
    if (record.active) {
      this.push(record);
    }
    callback();
  }
});
```

### Database Operations

```javascript
// Query results as objects
const { Readable } = require('stream');

async function* queryDatabase() {
  const results = await db.query('SELECT * FROM users');
  for (const row of results) {
    yield row;
  }
}

const stream = Readable.from(queryDatabase(), { objectMode: true });
```

## Mixing Modes

### Through Serialization

```javascript
// String mode to Object mode
const parser = new Transform({
  readableObjectMode: true,
  transform(chunk, encoding, callback) {
    try {
      this.push(JSON.parse(chunk.toString()));
      callback();
    } catch (err) {
      callback(err);
    }
  }
});

// Object mode to String mode
const serializer = new Transform({
  writableObjectMode: true,
  transform(obj, encoding, callback) {
    this.push(JSON.stringify(obj));
    callback();
  }
});
```

## Readable.from() with Objects

```javascript
const { Readable } = require('stream');

// From array
Readable.from([1, 2, 3], { objectMode: true });

// From async iterator
Readable.from(async function* () {
  for await (const row of db.query('SELECT *')) {
    yield row;
  }
}(), { objectMode: true });
```

## Readable.wrapBy() Objects

```javascript
// Transform objects to string lines
const stringify = new Transform({
  objectMode: true,
  transform(obj, _, callback) {
    this.push(JSON.stringify(obj) + '\n');
    callback();
  }
});
```

## Key Differences from Binary Mode

| Aspect | Binary Mode | Object Mode |
|--------|-------------|-------------|
| Data type | Buffer/String | Any JS value |
| `highWaterMark` | bytes | object count |
| Encoding | configurable | N/A |
| null handling | signals end | passes as value |

## Errors in Object Mode

Objects can include error instances:

```javascript
readable.on('data', (data) => {
  if (data instanceof Error) {
    console.error(data.message);
  }
});
```

## Performance Considerations

- Object mode typically slower than binary
- Avoid creating unnecessary objects
- Consider batching for high-volume processing
- `objectMode: true` cannot use `highWaterMark` as bytes
