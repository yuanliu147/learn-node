# LLM Proxy / Provider Adapter Pattern

## Concept

An LLM Proxy acts as an intermediary that standardizes interactions with various Large Language Model providers. It provides a unified interface regardless of whether you're using OpenAI, Anthropic, Google, or local models.

## Why Use an LLM Proxy?

- **Provider Abstraction**: Switch providers without changing application code
- **Rate Limiting**: Control API usage across multiple providers
- **Caching**: Avoid redundant API calls for identical prompts
- **Fallback**: Automatically switch to backup providers on failure
- **Observability**: Centralize logging, metrics, and cost tracking
- **Security**: Hide API keys, sanitize requests/responses

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Client    │────▶│  LLM Proxy  │────▶│ OpenAI       │
│             │◀────│             │◀────│ Anthropic   │
│             │     │  - Routing  │     │ Google       │
│             │     │  - Caching  │     │ Local Model  │
└─────────────┘     │  - Limits   │     └──────────────┘
                    │  - Metrics  │
                    └─────────────┘
```

## Adapter Interface

```typescript
interface LLMAdapter {
  // Generation
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
  stream(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk>;
  
  // Embeddings
  embed(text: string | string[]): Promise<number[][]>;
  
  // Model management
  listModels(): Promise<Model[]>;
  getModel(modelId: string): Model;
  
  // Health
  ping(): Promise<boolean>;
}

interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
}

interface StreamChunk {
  content: string;
  done: boolean;
  usage?: TokenUsage;
}
```

## Implementation

### LLM Proxy Class

```javascript
class LLMProxy {
  constructor(adapters) {
    this.adapters = adapters;
    this.cache = new Map();
    this.metrics = { requests: 0, tokens: 0, errors: 0 };
  }

  async generate(prompt, options = {}) {
    const adapter = this.selectAdapter(options.model);
    return adapter.generate(prompt, options);
  }

  async stream(prompt, options = {}) {
    const adapter = this.selectAdapter(options.model);
    return adapter.stream(prompt, options);
  }

  selectAdapter(preferredModel) {
    // Select based on model prefix or availability
    for (const [name, adapter] of Object.entries(this.adapters)) {
      if (!preferredModel || preferredModel.startsWith(name)) {
        return adapter;
      }
    }
    throw new Error('No suitable adapter found');
  }
}
```

### Simple OpenAI Adapter

```javascript
class OpenAIAdapter {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.baseURL = options.baseURL || 'https://api.openai.com/v1';
    this.model = options.defaultModel || 'gpt-3.5-turbo';
  }

  async generate(prompt, options = {}) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage
    };
  }

  async *stream(prompt, options = {}) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.choices[0].delta.content) {
            yield { content: data.choices[0].delta.content, done: false };
          }
        }
      }
    }

    yield { content: '', done: true };
  }
}
```

## Usage Examples

### Basic Usage

```javascript
const proxy = new LLMProxy({
  openai: new OpenAIAdapter(process.env.OPENAI_API_KEY),
  anthropic: new AnthropicAdapter(process.env.ANTHROPIC_API_KEY)
});

// Generate text
const result = await proxy.generate('What is Node.js?');
console.log(result.content);

// Stream text
for await (const chunk of proxy.stream('Explain streams')) {
  process.stdout.write(chunk.content);
}
```

### With Rate Limiting

```javascript
const { Semaphore } = require('./semaphore');

class RateLimitedProxy extends LLMProxy {
  constructor(adapters, requestsPerSecond = 10) {
    super(adapters);
    this.semaphore = new Semaphore(requestsPerSecond);
  }

  async generate(prompt, options) {
    return this.semaphore.withLock(() => super.generate(prompt, options));
  }
}
```

### With Caching

```javascript
class CachedProxy extends LLMProxy {
  constructor(adapters, ttl = 3600000) {
    super(adapters);
    this.cache = new Map();
    this.ttl = ttl;
  }

  getCacheKey(prompt, options) {
    return JSON.stringify({ prompt, options });
  }

  async generate(prompt, options) {
    const key = this.getCacheKey(prompt, options);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.result;
    }

    const result = await super.generate(prompt, options);
    this.cache.set(key, { result, timestamp: Date.now() });
    return result;
  }
}
```

## Testing

Run tests with:
```bash
node --test test/*.test.js
```

## Key Design Principles

1. **Single Responsibility**: Each adapter handles only one provider
2. **Interface Consistency**: All adapters implement the same methods
3. **Error Normalization**: Errors are wrapped in consistent formats
4. **Graceful Degradation**: Failures don't cascade
5. **Observability**: All operations are logged and metered

## Provider-Specific Notes

### OpenAI
- Uses `/v1/chat/completions` for chat models
- Uses `/v1/completions` for older models
- Streaming uses Server-Sent Events

### Anthropic
- Uses `/v1/messages` endpoint
- Requires `Anthropic-Version` header
- Streaming returns offset-based chunks

### Google
- Uses Vertex AI or Gemini API
- Different authentication (service accounts)
- Different response formats
