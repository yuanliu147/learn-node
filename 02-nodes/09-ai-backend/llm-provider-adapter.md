# LLM Provider Adapter: Architectural Analysis

## The Problem: Multi-Provider LLM Integration

When building AI applications, vendor lock-in is a significant risk. Providers differ in:
- **Capability:** Different models excel at different tasks
- **Cost:** Price per token varies 100x between providers
- **Latency:** Response times vary by provider and region
- **Reliability:** Uptime guarantees differ
- **Compliance:** Data residency requirements vary by region

The Adapter Pattern provides **abstraction at the boundary**, enabling provider switching without changing business logic.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                            │
│                                                                     │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │
│   │   Chatbot   │   │  Summarizer │   │  Classifier │              │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘              │
│          │                 │                 │                      │
│          └────────────────┴─────────────────┘                      │
│                           │                                        │
│                    ┌──────▼──────┐                                 │
│                    │  LLMService │  ◄── Business logic uses this   │
│                    └──────┬──────┘                                 │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────────┐
│                    ┌──────▼──────┐       Adapter Layer              │
│                    │  Adapter    │                                 │
│                    │  Interface  │  ◄── Contract definition         │
│                    └──────┬──────┘                                 │
│          ┌────────────────┼────────────────┐                       │
│          │                │                │                        │
│   ┌──────▼─────┐   ┌──────▼─────┐   ┌──────▼─────┐                │
│   │  OpenAI    │   │ Anthropic  │   │  Ollama   │   ...           │
│   │  Adapter   │   │  Adapter   │   │  Adapter  │                  │
│   └──────┬─────┘   └──────┬─────┘   └──────┬─────┘                │
└──────────┼────────────────┼────────────────┼────────────────────────┘
           │                │                │
           ▼                ▼                ▼
     ┌─────────┐      ┌─────────┐      ┌─────────┐
     │OpenAI   │      │Anthropic│      │ Local   │
     │API      │      │API      │      │ Server  │
     └─────────┘      └─────────┘      └─────────┘
```

## Adapter Interface Design

### Interface as a Contract

```typescript
// The interface defines WHAT not HOW
interface LLMAdapter {
  // Core generation — the primary use case
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
  stream(prompt: string, options?: GenerateOptions): AsyncGenerator<StreamChunk>;
  
  // Embeddings — for RAG and similarity search
  embed(text: string | string[]): Promise<number[][]>;
  
  // Introspection
  listModels(): Promise<Model[]>;
  getModel(modelId: string): Model;
  
  // Health verification
  ping(): Promise<boolean>;
}
```

**Architecture decision:** Keep the interface minimal. Each method should be independently useful and cover ≥80% of use cases. Avoid adding methods that would require different semantics per provider.

### Generics vs Provider-Specific Options

```typescript
// Problem: Some options only apply to certain providers
// Option A: Generic options (limiting)
interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
// ❌ Can't express: topP, stopSequences, responseFormat

// Option B: Union of provider-specific options (complex)
type GenerateOptions = 
  | { provider: 'openai'; model: string; ... }
  | { provider: 'anthropic'; ... };

// Option C: Flatten with optional provider-specific keys (pragmatic) ✓
interface GenerateOptions {
  // Common
  model?: string;
  temperature?: number;
  maxTokens?: number;
  
  // OpenAI-specific (ignored by other providers)
  topP?: number;
  responseFormat?: { type: 'text' | 'json_object' };
  
  // Anthropic-specific (ignored by other providers)
  thinking?: { type: 'enabled'; budgetTokens: number };
}
```

**Decision:** Option C. Providers ignore options they don't understand. New options can be added without interface changes. The tradeoff is discoverability — not all options work everywhere.

## Provider Implementation Patterns

### OpenAI Adapter

```typescript
class OpenAIAdapter implements LLMAdapter {
  private baseURL = 'https://api.openai.com/v1';
  
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
        top_p: options.topP,
        stop: options.stop,
        response_format: options.responseFormat
      })
    });
    
    if (!response.ok) {
      throw normalizeError(response.status, response.body, 'openai');
    }
    
    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      },
      raw: data  // For debugging/advanced usage
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
    
    // SSE stream parsing
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.choices[0].delta.content) {
            yield {
              content: data.choices[0].delta.content,
              done: false,
              usage: data.usage ? {
                inputTokens: data.usage.prompt_tokens,
                outputTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
              } : undefined
            };
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
  
  async generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    // Anthropic uses messages array, not prompt string
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
        max_tokens: options.maxTokens || 1024,
        thinking: options.thinking  // Anthropic-specific
      })
    });
    
    const data = await response.json();
    return {
      content: data.content[0].text,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      }
    };
  }
}
```

## Error Normalization Architecture

Each provider has different error formats. The adapter layer must normalize these into a unified error hierarchy.

```typescript
// Unified error taxonomy
class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly provider: string,
    public readonly retryable: boolean,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

enum ErrorCode {
  // Authentication & Permissions
  AUTHENTICATION_ERROR = 'AUTH_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // Request errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  CONTEXT_LENGTH_EXCEEDED = 'CONTEXT_LENGTH_EXCEEDED',
  
  // Rate limiting (retryable)
  RATE_LIMIT = 'RATE_LIMIT',
  TOKENS_PER_MINUTE_LIMIT = 'TOKENS_PER_MINUTE',
  
  // Server errors (potentially retryable)
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  TIMEOUT = 'TIMEOUT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // Network errors (retryable)
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT'
}

// Provider-specific error mapping
function normalizeError(response: Response, body: any, provider: string): LLMError {
  const retryableCodes = [ErrorCode.RATE_LIMIT, ErrorCode.TIMEOUT, 
                          ErrorCode.SERVICE_UNAVAILABLE, ErrorCode.NETWORK_ERROR];
  
  switch (provider) {
    case 'openai':
      // OpenAI error format: { error: { code: string, message: string } }
      const openaiErr = body?.error;
      const code = mapOpenAIErrorCode(openaiErr?.code);
      return new LLMError(openaiErr?.message, code, provider, 
                         retryableCodes.includes(code), openaiErr);
    
    case 'anthropic':
      // Anthropic error format: { type: string, message: string }
      const anthropicErr = body;
      const code = mapAnthropicErrorCode(anthropicErr?.type);
      return new LLMError(anthropicErr?.message, code, provider,
                         retryableCodes.includes(code), anthropicErr);
    
    default:
      return new LLMError('Unknown error', ErrorCode.PROVIDER_ERROR, 
                         provider, true, body);
  }
}

function mapOpenAIErrorCode(code?: string): ErrorCode {
  const mapping: Record<string, ErrorCode> = {
    'invalid_api_key': ErrorCode.AUTHENTICATION_ERROR,
    'rate_limit_exceeded': ErrorCode.RATE_LIMIT,
    'model_not_found': ErrorCode.MODEL_NOT_FOUND,
    'context_length_exceeded': ErrorCode.CONTEXT_LENGTH_EXCEEDED,
    'server_error': ErrorCode.PROVIDER_ERROR
  };
  return mapping[code || ''] || ErrorCode.PROVIDER_ERROR;
}
```

## Factory and Registration Pattern

```typescript
class LLMProviderFactory {
  // Registry of available adapters
  private static adapters = new Map<string, {
    ctor: new (config: ProviderConfig) => LLMAdapter;
    defaultConfig: Partial<ProviderConfig>;
  }>();
  
  // Deferred registration allows adapter registration at import time
  // while factory can be used before any adapter is registered
  static register(
    name: string, 
    adapterClass: new (config: ProviderConfig) => LLMAdapter,
    defaultConfig: Partial<ProviderConfig> = {}
  ): void {
    this.adapters.set(name, { ctor: adapterClass, defaultConfig });
  }
  
  static create(name: string, config: Partial<ProviderConfig> = {}): LLMAdapter {
    const entry = this.adapters.get(name);
    if (!entry) {
      const available = Array.from(this.adapters.keys()).join(', ');
      throw new Error(
        `Unknown LLM provider: ${name}. Available: ${available}`
      );
    }
    
    // Deep merge default config with provided config
    const fullConfig = { ...entry.defaultConfig, ...config };
    return new entry.ctor(fullConfig);
  }
  
  static listProviders(): string[] {
    return Array.from(this.adapters.keys());
  }
}

// Registration happens at module load time
// This allows clean separation between adapter definition and registration
LLMProviderFactory.register('openai', OpenAIAdapter, {
  baseURL: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4',
  maxRetries: 3
});

LLMProviderFactory.register('anthropic', AnthropicAdapter, {
  baseURL: 'https://api.anthropic.com/v1',
  defaultModel: 'claude-3-opus-20240229',
  maxRetries: 3
});
```

## Retry and Circuit Breaker Architecture

```typescript
// Layered resilience: Retry policy + circuit breaker

class ResilientAdapter implements LLMAdapter {
  private retryPolicy: RetryPolicy;
  private circuitBreaker: CircuitBreaker;
  private inner: LLMAdapter;
  
  constructor(inner: LLMAdapter, options: ResilienceOptions) {
    this.inner = inner;
    this.retryPolicy = new RetryPolicy(options.maxRetries, options.backoff);
    this.circuitBreaker = new CircuitBreaker(
      options.failureThreshold,
      options.resetTimeout
    );
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    return this.circuitBreaker.execute(() => 
      this.retryPolicy.execute(() => this.inner.generate(prompt, options))
    );
  }
}

class RetryPolicy {
  constructor(
    private maxRetries: number,
    private backoff: 'exponential' | 'linear' = 'exponential'
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (!this.isRetryable(error) || attempt === this.maxRetries) {
          throw error;
        }
        
        const delay = this.backoff === 'exponential'
          ? Math.min(1000 * 2 ** attempt, 30000)  // Cap at 30s
          : 1000 * attempt;
          
        await sleep(delay);
      }
    }
    
    throw lastError!;
  }
  
  private isRetryable(error: any): boolean {
    return error instanceof LLMError && error.retryable;
  }
}

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private failureThreshold: number = 5,
    private resetTimeout: number = 60000  // 1 minute
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new LLMError('Circuit breaker open', ErrorCode.SERVICE_UNAVAILABLE, 
                          'circuit-breaker', true);
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }
}
```

## Multi-Provider Routing Strategies

### Strategy 1: Cost-Based Routing

```typescript
class CostAwareRouter {
  constructor(
    private adapters: Map<string, LLMAdapter>,
    private modelCosts: Map<string, { inputPer1M: number; outputPer1M: number }>
  ) {}
  
  async generate(
    prompt: string, 
    options: GenerateOptions,
    constraints: { maxCostPer1M?: number; preferredProvider?: string }
  ): Promise<GenerateResult> {
    // Try preferred provider first if specified
    if (constraints.preferredProvider) {
      const adapter = this.adapters.get(constraints.preferredProvider);
      if (adapter) {
        return adapter.generate(prompt, options);
      }
    }
    
    // Try each provider in order of cost
    for (const [name, adapter] of this.adapters) {
      const cost = this.estimateCost(prompt, options, name);
      
      if (constraints.maxCostPer1M && cost > constraints.maxCostPer1M) {
        continue;  // Too expensive, try next
      }
      
      try {
        return await adapter.generate(prompt, options);
      } catch (error) {
        // Try next provider on failure
        console.warn(`Provider ${name} failed:`, error);
      }
    }
    
    throw new LLMError('All providers failed', ErrorCode.SERVICE_UNAVAILABLE, 'router', true);
  }
  
  private estimateCost(prompt: string, options: GenerateOptions, provider: string): number {
    const model = options.model || 'default';
    const costKey = `${provider}:${model}`;
    const cost = this.modelCosts.get(costKey);
    
    if (!cost) return Infinity;
    
    const inputTokens = this.countTokens(prompt);
    const outputTokens = options.maxTokens || 1000;
    
    return (inputTokens / 1_000_000) * cost.inputPer1M +
           (outputTokens / 1_000_000) * cost.outputPer1M;
  }
}
```

### Strategy 2: Parallel Fan-Out with First-Wins

```typescript
async function multiGenerate(
  prompt: string,
  options: GenerateOptions,
  providers: string[]
): Promise<GenerateResult> {
  const results = await Promise.race(
    providers.map(provider => 
      llm.adapters.get(provider).generate(prompt, options)
        .then(result => ({ provider, result }))
    )
  );
  
  console.log(`First response from: ${results.provider}`);
  return results.result;
}
```

## Unified Service Layer

```typescript
// Application code never directly uses adapters
// This layer provides business-logic-friendly APIs

class LLMService {
  constructor(private adapter: LLMAdapter) {}
  
  // Simple completion
  async complete(prompt: string): Promise<string> {
    const result = await this.adapter.generate(prompt);
    return result.content;
  }
  
  // Streaming completion
  async *streamComplete(prompt: string): AsyncGenerator<string> {
    for await (const chunk of this.adapter.stream(prompt)) {
      yield chunk.content;
    }
  }
  
  // Structured output
  async completeJSON<T>(prompt: string, schema: JSONSchema): Promise<T> {
    const options: GenerateOptions = {
      responseFormat: { type: 'json_object' },
      // Add schema to prompt...
    };
    
    const result = await this.adapter.generate(prompt, options);
    return JSON.parse(result.content);
  }
  
  // Batch embedding
  async embedTexts(texts: string[]): Promise<number[][]> {
    return this.adapter.embed(texts);
  }
  
  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      return await this.adapter.ping();
    } catch {
      return false;
    }
  }
}
```

## Configuration Architecture

```yaml
# config.yaml — hierarchical configuration
providers:
  openai:
    adapter: openai
    config:
      apiKey: ${OPENAI_API_KEY}
      baseURL: https://api.openai.com/v1
      defaultModel: gpt-4
      maxRetries: 3
      timeout: 60000
  
  anthropic:
    adapter: anthropic
    config:
      apiKey: ${ANTHROPIC_API_KEY}
      baseURL: https://api.anthropic.com/v1
      defaultModel: claude-3-opus-20240229
      maxRetries: 3
  
  ollama:
    adapter: ollama
    config:
      baseURL: http://localhost:11434
      defaultModel: llama3

# Provider selection strategy
routing:
  defaultProvider: openai
  fallbackOrder:
    - openai
    - anthropic
    - ollama
  costConstraint:
    maxPer1MTokens: 10.00  # Reject if more expensive

# Model registry (for capabilities/costs)
models:
  gpt-4:
    contextWindow: 8192
    supportsStreaming: true
    supportsFunctions: true
    inputCostPer1M: 30.00
    outputCostPer1M: 60.00
  claude-3-opus-20240229:
    contextWindow: 200000
    supportsStreaming: true
    supportsFunctions: false
    inputCostPer1M: 15.00
    outputCostPer1M: 75.00
```

## Architectural Summary

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Interface design | Minimal, generic options | Reduces coupling; enables evolution |
| Error handling | Normalized hierarchy | Consistent application error handling |
| Resilience | Retry + Circuit breaker | Production reliability |
| Factory pattern | Deferred registration | Clean module boundaries |
| Routing | Strategy-based | Supports cost, reliability, latency optimization |
| Configuration | Hierarchical with env vars | Environment-specific without code changes |

The adapter pattern's primary value is **decoupling**. Business logic should never know or care which LLM provider is in use. This enables:

1. **Provider switching** based on cost, availability, or capability
2. **A/B testing** between providers
3. **Gradual migration** when providers change APIs
4. **Fallback handling** when providers fail
5. **Cost optimization** by routing based on query complexity
