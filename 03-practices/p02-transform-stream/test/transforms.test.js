const { test, describe } = require('node:test');
const assert = require('node:assert');
const { Readable, Writable } = require('stream');
const { pipeline } = require('stream/promises');
const {
  JSONParser,
  LineCounter,
  UppercaseTransform,
  ChunkSplitter,
  RateLimitedTransform,
  ConcatenatingTransform
} = require('../src/transforms');

/**
 * Helper to create a readable stream from an array of strings
 */
function createReadableFromArray(arr) {
  let index = 0;
  return new Readable({
    read() {
      if (index < arr.length) {
        this.push(arr[index++]);
      } else {
        this.push(null);
      }
    }
  });
}

/**
 * Helper to collect all output from a stream
 */
async function collectStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('JSONParser', () => {
  test('parses valid newline-delimited JSON', async () => {
    const parser = new JSONParser();
    const input = createReadableFromArray(['{"a":1}\n', '{"b":2}\n', '{"c":3}']);
    
    const results = await collectStream(input.pipe(parser));
    
    assert.strictEqual(results.length, 3);
    assert.deepStrictEqual(results[0], { a: 1 });
    assert.deepStrictEqual(results[1], { b: 2 });
    assert.deepStrictEqual(results[2], { c: 3 });
  });

  test('handles split JSON across chunks', async () => {
    const parser = new JSONParser();
    // Split a JSON object across multiple pushes
    const input = new Readable({
      read() {
        if (!this.pushed) {
          this.push('{"name":');
          this.push('"test"}');
          this.push(null);
          this.pushed = true;
        }
      }
    });
    
    const results = await collectStream(input.pipe(parser));
    
    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual(results[0], { name: 'test' });
  });

  test('emits error on invalid JSON', async () => {
    const parser = new JSONParser();
    const input = createReadableFromArray(['{"a":1}\n', 'invalid json\n', '{"b":2}']);
    
    await assert.rejects(
      async () => {
        await collectStream(input.pipe(parser));
      },
      { message: 'Invalid JSON: invalid json' }
    );
  });

  test('handles empty lines', async () => {
    const parser = new JSONParser();
    const input = createReadableFromArray(['{"a":1}\n\n\n', '{"b":2}']);
    
    const results = await collectStream(input.pipe(parser));
    
    assert.strictEqual(results.length, 2);
  });
});

describe('LineCounter', () => {
  test('counts lines correctly', async () => {
    const counter = new LineCounter();
    const input = createReadableFromArray(['line1\n', 'line2\n', 'line3\n']);
    
    const results = await collectStream(input.pipe(counter));
    const output = results.join('');
    
    assert.strictEqual(counter.lineCount, 3);
    assert.ok(output.includes('Line Count: 3'));
  });

  test('handles no trailing newline', async () => {
    const counter = new LineCounter();
    // When there's no trailing newline, we count the lines by newlines in chunk
    // "line1\nline2\nline3" has 2 newlines, so 2 lines
    const input = createReadableFromArray(['line1\nline2\nline3']);
    
    const results = await collectStream(input.pipe(counter));
    const output = results.join('');
    
    assert.strictEqual(counter.lineCount, 2);
    assert.ok(output.includes('Line Count: 2'));
  });
});

describe('UppercaseTransform', () => {
  test('converts text to uppercase', async () => {
    const upper = new UppercaseTransform();
    const input = createReadableFromArray(['hello', ' world', '!']);
    
    const results = await collectStream(input.pipe(upper));
    
    assert.strictEqual(results.join(''), 'HELLO WORLD!');
  });

  test('handles mixed case', async () => {
    const upper = new UppercaseTransform();
    const input = createReadableFromArray(['HeLLo WoRLd']);
    
    const results = await collectStream(input.pipe(upper));
    
    assert.strictEqual(results.join(''), 'HELLO WORLD');
  });
});
describe('ChunkSplitter', () => {
  test('emits chunks when buffer exceeds chunk size', async () => {
    const splitter = new ChunkSplitter(5);
    
    // Collect chunks manually via events
    const chunks = [];
    splitter.on('data', (chunk) => chunks.push(chunk));
    
    const input = createReadableFromArray(['hello world']);
    input.pipe(splitter);
    
    // Wait for stream to complete
    await new Promise(resolve => {
      splitter.on('end', resolve);
    });
    
    // 'hello world' is 11 chars. With chunkSize=5:
    // Should get 3 chunks: 'hello' (5), ' worl' (5), 'd' (1)
    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(chunks[0].toString(), 'hello');
    assert.strictEqual(chunks[1].toString(), ' worl');
    assert.strictEqual(chunks[2].toString(), 'd');
  });

  test('handles data smaller than chunk size', async () => {
    const splitter = new ChunkSplitter(100);
    const input = createReadableFromArray(['short']);
    
    const results = await collectStream(input.pipe(splitter));
    
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].toString(), 'short');
  });

  test('flushes remaining data at end of stream', async () => {
    const splitter = new ChunkSplitter(5);
    const chunks = [];
    splitter.on('data', (chunk) => chunks.push(chunk));
    
    // Create a readable that sends multiple chunks
    const readable = new Readable({
      read() {
        if (!this.n) this.n = 0;
        this.n++;
        if (this.n === 1) {
          this.push('12345'); // exactly 5 chars
        } else if (this.n === 2) {
          this.push('678');   // 3 chars (remainder)
        } else {
          this.push(null);
        }
      }
    });
    
    readable.pipe(splitter);
    
    await new Promise(resolve => {
      splitter.on('end', resolve);
    });
    
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].toString(), '12345');
    assert.strictEqual(chunks[1].toString(), '678');
  });
});

describe('ConcatenatingTransform', () => {
  test('collects all chunks into single buffer', async () => {
    const concat = new ConcatenatingTransform();
    const input = createReadableFromArray(['hello', ' ', 'world']);
    
    const results = await collectStream(input.pipe(concat));
    
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].toString(), 'hello world');
  });
});

describe('Integration with pipeline', () => {
  test('can chain multiple transforms', async () => {
    const upper = new UppercaseTransform();
    const counter = new LineCounter();
    const input = createReadableFromArray(['line1\n', 'line2\n', 'line3\n']);
    
    let output = '';
    for await (const chunk of input.pipe(upper).pipe(counter)) {
      output += chunk;
    }
    
    assert.ok(output.includes('LINE1'));
    assert.ok(output.includes('LINE2'));
    assert.ok(output.includes('LINE3'));
    assert.ok(output.includes('Line Count: 3'));
  });
});
