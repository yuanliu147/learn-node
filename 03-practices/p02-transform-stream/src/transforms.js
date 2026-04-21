const { Transform } = require('stream');

/**
 * JSON Parser - transforms raw text into parsed JSON objects
 * Expects newline-delimited JSON
 */
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
    // Process any remaining data in buffer
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

/**
 * Line Counter - counts lines and appends count at the end
 */
class LineCounter extends Transform {
  constructor() {
    super();
    this.lineCount = 0;
  }

  _transform(chunk, _, callback) {
    const text = chunk.toString();
    // Count newlines in the chunk
    const newlines = text.split('\n').length - 1;
    this.lineCount += newlines;
    this.push(chunk);
    callback();
  }

  _flush(callback) {
    this.push(`\n--- Line Count: ${this.lineCount} ---\n`);
    callback();
  }
}

/**
 * Uppercase Transform - converts all text to uppercase
 */
class UppercaseTransform extends Transform {
  constructor() {
    super();
  }

  _transform(chunk, encoding, callback) {
    this.push(chunk.toString().toUpperCase());
    callback();
  }
}

/**
 * Chunk Split Transform - splits data into smaller chunks
 */
class ChunkSplitter extends Transform {
  constructor(chunkSize = 64) {
    super();
    this.chunkSize = chunkSize;
    this.buffer = Buffer.alloc(0);
  }

  _transform(chunk, _, callback) {
    // Accumulate with any existing buffer
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= this.chunkSize) {
      const piece = this.buffer.slice(0, this.chunkSize);
      this.buffer = this.buffer.slice(this.chunkSize);
      this.push(piece);
    }

    callback();
  }

  _flush(callback) {
    // Push any remaining data smaller than chunkSize
    if (this.buffer.length > 0) {
      this.push(this.buffer);
    }
    callback();
  }
}

/**
 * Rate Limited Transform - limits the throughput of data
 */
class RateLimitedTransform extends Transform {
  constructor(bytesPerSecond = 1024) {
    super();
    this.bytesPerSecond = bytesPerSecond;
    this.bytesProcessed = 0;
    this.lastReset = Date.now();
  }

  _transform(chunk, _, callback) {
    const now = Date.now();
    const elapsed = now - this.lastReset;

    // Reset counter every second
    if (elapsed >= 1000) {
      this.bytesProcessed = 0;
      this.lastReset = now;
    }

    // Simulate rate limiting delay
    const delay = (chunk.length / this.bytesPerSecond) * 1000;
    setTimeout(() => {
      this.push(chunk);
      callback();
    }, delay);
  }
}

/**
 * Concatenating Transform - collects all chunks into a single buffer
 * Outputs the complete buffer at the end
 */
class ConcatenatingTransform extends Transform {
  constructor() {
    super({ writableObjectMode: true, readableObjectMode: true });
    this.chunks = [];
  }

  _transform(chunk, _, callback) {
    this.chunks.push(chunk);
    callback();
  }

  _flush(callback) {
    const total = Buffer.concat(this.chunks);
    this.push(total);
    callback();
  }
}

module.exports = {
  JSONParser,
  LineCounter,
  UppercaseTransform,
  ChunkSplitter,
  RateLimitedTransform,
  ConcatenatingTransform
};
