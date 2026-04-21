# Stream Types in Node.js

Streams are abstract interfaces for working with streaming data in Node.js. There are four fundamental stream types:

## 1. Readable Streams
Sources that produce data that can be consumed.
- `fs.createReadStream()` - reading files
- `http.IncomingMessage` - HTTP response objects
- `process.stdin` - standard input
- `net.Socket` - TCP sockets
- `Readable.from()` - from iterables/arrays

### Key States
- **Flowing mode**: Data pushed automatically via `data` events
- **Paused mode**: Data must be explicitly pulled via `read()`

### Core Methods
- `read(size)` - Pull data from the buffer
- `pause()` - Pause emitting events
- `resume()` - Resume emitting events
- `pipe(destination)` - Pipe to a writable

## 2. Writable Streams
Destinations that receive data.
- `fs.createWriteStream()` - writing files
- `http.ClientRequest` - HTTP request objects
- `process.stdout` / `process.stderr` - standard output/error
- `net.Socket` - TCP sockets
- `response.write()` - HTTP server responses

### Core Methods
- `write(chunk, callback)` - Write data
- `end(chunk)` - Signal no more data
- `cork()` / `uncork()` - Buffer writes

## 3. Duplex Streams
Both readable and writable (e.g., TCP sockets).
- `net.Socket`
- `crypto.Stream`
- `WebSocket`

## 4. Transform Streams
Duplex streams that can modify/transform data.
- `zlib.createGzip()` - compression
- `zlib.createGunzip()` - decompression
- `crypto.createCipheriv()` - encryption
- `ThroughStream` / `PassThroughStream`

### PassThrough
A special transform that simply passes through all data unchanged. Useful for debugging or inserting into pipeline.

## Stream Events

### Readable Events
- `data` - emitted when data is available
- `end` - emitted when no more data
- `error` - emitted on errors
- `close` - emitted when stream is closed
- `readable` - emitted when data is ready to read

### Writable Events
- `drain` - emitted when buffer is drained
- `finish` - emitted when end() is called
- `error` - emitted on errors
- `close` - emitted when stream is closed

## Buffering
Streams maintain internal buffers:
- `readableFlowing` - null (paused), true (flowing), false (ended)
- `writableHighWaterMark` - default 16KB for streams, 64KB for file streams
