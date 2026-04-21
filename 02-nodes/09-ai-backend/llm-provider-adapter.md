# LLM Provider Adapter Pattern

## Concept

An LLM Provider Adapter is a unified interface that abstracts differences between various LLM providers (OpenAI, Anthropic, Google, local models, etc.). It allows application code to switch providers or add new ones without changing business logic.

## Why Adapter Pattern?

Each LLM provider has different:
- API authentication (API keys, Bearer tokens)
- Endpoint URLs and versioning
- Request/response formats
- Streaming mechanisms
- Error handling patterns
- Rate limits and quotas

## Adapter Interface

```typescript
interface LLMAdapter {
  // Core generation
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
  stream(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk>;
  
  // Embeddings
  embed(text: string | string[]): Promise<number[][]>;
  
  // Model management
  listModels(): Promise<Model[]>;
  getModel(modelId: string): Model;
  
  // Health check
  ping(): Promise<boolean>;
}

interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  functions?: FunctionDef[];
}

interface StreamChunk {
  content: string;
  done: boolean;
  usage?: TokenUsage;
}
```

## Provider Implementations

### OpenAI Adapter

```typescript
class OpenAIAdapter implements LLMAdapter {
  private baseURL = 'https://api.openai.com/v1';
  private apiKey: string;
  
  async generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stop: options.stop
      })
    });
    
    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage
    };
  }
  
  async *stream(prompt: string, options: GenerateOptions = {}): AsyncGenerator<StreamChunk> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: true
      })
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      // Parse SSE format: data: {"choices":[{"delta":{"content":"..."}}]}
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

### Anthropic Adapter

```typescript
class AnthropicAdapter implements LLMAdapter {
  private baseURL = 'https://api.anthropic.com/v1';
  private apiKey: string;
  
  async generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 1024
      })
    });
    
    const data = await response.json();
    return {
      content: data.content[0].text,
      usage: { input: data.usage.input_tokens, output: data.usage.output_tokens }
    };
  }
}
```

## Factory Pattern

```typescript
class LLMProviderFactory {
  private static adapters = new Map<string, new (config: any) => LLMAdapter>();
  
  static register(name: string, adapterClass: new (config: any) => LLMAdapter) {
    this.adapters.set(name, adapterClass);
  }
  
  static create(name: string, config: any): LLMAdapter {
    const AdapterClass = this.adapters.get(name);
    if (!AdapterClass) {
      throw new Error(`Unknown LLM provider: ${name}`);
    }
    return new AdapterClass(config);
  }
}

// Register providers
LLMProviderFactory.register('openai', OpenAIAdapter);
LLMProviderFactory.register('anthropic', AnthropicAdapter);
LLMProviderFactory.register('ollama', OllamaAdapter);

// Use
const llm = LLMProviderFactory.create('openai', { apiKey: process.env.OPENAI_KEY });
```

## Unified API Layer

```typescript
class LLMService {
  private adapter: LLMAdapter;
  
  constructor(adapter: LLMAdapter) {
    this.adapter = adapter;
  }
  
  async complete(prompt: string): Promise<string> {
    const result = await this.adapter.generate(prompt);
    return result.content;
  }
  
  async *streamComplete(prompt: string): AsyncGenerator<string> {
    for await (const chunk of this.adapter.stream(prompt)) {
      yield chunk.content;
    }
  }
}

// Application code uses LLMService, never directly touching adapters
const llm = new LLMService(LLMProviderFactory.create('openai', { apiKey }));
const story = await llm.complete('Write a haiku about coding');
```

## Error Normalization

```typescript
class LLMAdapterError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public retryable: boolean
  ) {
    super(message);
  }
}

function normalizeError(error: any, provider: string): LLMAdapterError {
  // Map provider-specific errors to normalized codes
  if (provider === 'openai') {
    if (error.code === 'rate_limit_exceeded') {
      return new LLMAdapterError('Rate limit exceeded', 'RATE_LIMIT', provider, true);
    }
    if (error.code === 'invalid_api_key') {
      return new LLMAdapterError('Invalid API key', 'AUTH_ERROR', provider, false);
    }
  }
  
  return new LLMAdapterError(error.message, 'UNKNOWN', provider, true);
}
```

## Configuration Management

```yaml
# config.yaml
providers:
  openai:
    adapter: openai
    config:
      apiKey: ${OPENAI_API_KEY}
      baseURL: https://api.openai.com/v1
      defaultModel: gpt-4
  
  anthropic:
    adapter: anthropic
    config:
      apiKey: ${ANTHROPIC_API_KEY}
      baseURL: https://api.anthropic.com/v1
      defaultModel: claude-3-opus-20240229

defaultProvider: openai

models:
  gpt-4:
    contextWindow: 8192
    supportsStreaming: true
    supportsFunctions: true
```

## Summary

The LLM Provider Adapter pattern enables provider agnostic application code through:
- Unified interface hiding provider specifics
- Factory for dynamic provider instantiation
- Error normalization for consistent handling
- Configuration-driven provider selection
