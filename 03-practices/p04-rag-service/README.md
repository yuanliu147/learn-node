# RAG Service (p04)

A Retrieval-Augmented Generation (RAG) service demonstrating vector search integration with Node.js.

## Overview

This project demonstrates building a RAG service that:
- Embeds documents for semantic search
- Stores vectors in memory
- Retrieves relevant context for LLM prompts

## Quick Start

```bash
npm install
npm test
```

## Project Structure

```
├── src/
│   ├── index.js          # Main entry point
│   ├── embedder.js       # Document embedding logic
│   ├── vector-store.js   # Vector storage and search
│   └── rag.js            # RAG pipeline
└── test/
    └── rag.test.js       # Unit tests
```

## API

```javascript
const rag = require('./src/rag');

// Add documents
await rag.addDocuments([
  { id: '1', text: 'Node.js is a JavaScript runtime' },
  { id: '2', text: 'V8 engine powers Node.js' }
]);

// Query with context
const result = await rag.query('What is Node.js?');
console.log(result.answer);
console.log(result.context);
```

## License

MIT
