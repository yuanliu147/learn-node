# Transform Streams in Node.js

## Concept

Transform streams are a special type of Duplex stream that read data from one side, transform/process it, and output on the other side. They are the backbone of Node.js streaming data processing.

## Stream Types Overview

```
Readable → Transform → Writable
  (source)   (process)  (destination)
```

- **Readable**: Source of data (e.g., `fs.createReadStream()`, `process.stdin`)
- **Writable**: Destination for data (e.g., `fs.createWriteStream()`, `process.stdout`)
- **Duplex**: Both readable and writable (e.g., TCP socket)
- **Transform**: Duplex stream that transforms data (e.g., `zlib.createGzip()`)

## Transform Stream Anatomy

```javascript
const { Transform } = require('stream');

const transformer = new Transform({
  transform(chunk, encoding, callback) {
    // 1. Receive chunk from upstream readable
    // 2. Process the data
    // 3. Push transformed data downstream
    this.push(transformedData);
    // 4. Signal completion
    callback();
  }
});
```

## Common Patterns

### 1. JSON Parser (object mode)

Parse newline-delimited JSON streams:

```javascript
class JSONParser extends Transform {
  constructor() {
    super({ readableObjectMode: true });
    this.buffer = '';
  }

  _transform(chunk, _, callback) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    
    // Keep the last incomplete line in buffer
    this.buffer = lines.pop();
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          this.push(JSON.parse(line));
        } catch (e) {
          this.emit('error', new Error(`Invalid JSON: ${line}`));
          return;
        }
      }
    }
    callback();
  }

  _flush(callback) {
    // Process any remaining data
    if (this.buffer.trim()) {
      try {
        this.push(JSON.parse(this.buffer));
      } catch (e) {
        this.emit('error', new Error(`Invalid JSON at end: ${this.buffer}`));
        return;
      }
    }
    callback();
  }
}
```

### 2. Line Counter

Count lines in a stream:

```javascript
class LineCounter extends Transform {
  constructor() {
    super({ writableObjectMode: false });
    this.lineCount = 0;
  }

  _transform(chunk, _, callback) {
    const text = chunk.toString();
    this.lineCount += text.split('\n').length - 1;
    this.push(chunk);
    callback();
  }

  _flush(callback) {
    this.push(`\nLines: ${this.lineCount}\n`);
    callback();
  }
}
```

### 3. Compression/Decompression

```javascript
const { createGzip, createGunzip } = require('zlib');

// Pipeline for compressing data
const gzip = createGzip();
const source = fs.createReadStream('input.txt');
const destination = fs.createWriteStream('input.txt.gz');

source.pipe(gzip).pipe(destination);
```

### 4. Encryption Stream

```javascript
const crypto = require('crypto');

class EncryptStream extends Transform {
  constructor(key, iv) {
    super();
    this.cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  }

  _transform(chunk, _, callback) {
    this.push(this.cipher.update(chunk));
    callback();
  }

  _flush(callback) {
    this.push(this.cipher.final());
    callback();
  }
}
```

## Using pipeline()

Always prefer `pipeline()` over `pipe()` for error handling:

```javascript
const { pipeline } = require('stream/promises');
const fs = require('fs');

async function processFile(input, output) {
  const readStream = fs.createReadStream(input);
  const transform = new MyTransform();
  const writeStream = fs.createWriteStream(output);

  await pipeline(readStream, transform, writeStream);
  console.log('Pipeline completed successfully');
}
```

## Backpressure Handling

Transform streams automatically handle backpressure when properly implemented:

```javascript
class SlowTransform extends Transform {
  _transform(chunk, _, callback) {
    // Simulate slow processing
    setTimeout(() => {
      this.push(chunk.toString().toUpperCase());
      callback();
    }, 100);
  }
}
```

## Testing

Run tests with:
```bash
node --test test/*.test.js
```

## Key Methods

- `_transform(chunk, encoding, callback)`: Process incoming chunks
- `_flush(callback)`: Handle any remaining data at end of stream
- `this.push(data)`: Output transformed data
- `callback(err)`: Signal completion or error

## Error Handling

Always handle errors properly:

```javascript
transform.on('error', (err) => {
  console.error('Transform error:', err);
});

stream.destroy(err); // Destroy stream with error
```
