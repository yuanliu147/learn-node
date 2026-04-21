# Token & Rate Limit Management

## Overview

LLM APIs impose limits at multiple levels - requests per minute, tokens per minute, and concurrent connections. Effective management of these limits is critical for production AI applications.

## Rate Limit Structure

```typescript
interface RateLimitConfig {
  rpm: number;           // Requests per minute
  tpm: number;           // Tokens per minute  
  maxConcurrent: number; // Simultaneous connections
  cooldownMs: number;    // Wait time on 429
}

interface RateLimitStatus {
  available: boolean;
  remaining: { rpm: number; tpm: number; concurrent: number };
  resetAt: Date;
}
```

## Token Counting

### Prompt Token Estimation

```typescript
class TokenCounter {
  // Approximate token count using word-based estimation
  static estimate(text: string): number {
    // Rough approximation: ~0.75 tokens per word for English
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words / 0.75);
  }
  
  // More accurate with tiktoken-like encoding
  static async countOpenAI(text: string, model = 'gpt-4'): Promise<number> {
    const encoder = await getEncoder('cl100k_base'); // OpenAI's encoding
    return encoder.encode(text).length;
  }
  
  // Count prompt with message formatting
  static async countMessages(messages: Message[], model: string): Promise<number> {
    const encoded = await Promise.all(
      messages.map(m => this.countOpenAI(m.content, model))
    );
    
    // Add overhead per message (~4 tokens)
    return encoded.reduce((sum, count) => sum + count + 4, 0);
  }
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

### Token Budget Management

```typescript
class TokenBudget {
  private spent: number = 0;
  private windowStart: number = Date.now();
  
  constructor(
    private maxTokens: number,
    private windowMs: number = 60000
  ) {}
  
  async allocate(tokens: number): Promise<void> {
    this.cleanup();
    
    if (this.spent + tokens > this.maxTokens) {
      const waitTime = this.windowMs - (Date.now() - this.windowStart);
      await this.delay(waitTime);
      this.cleanup();
    }
    
    this.spent += tokens;
  }
  
  private cleanup() {
    if (Date.now() - this.windowStart > this.windowMs) {
      this.spent = 0;
      this.windowStart = Date.now();
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  }
  
  usage(): { spent: number; remaining: number; resetIn: number } {
    this.cleanup();
    return {
      spent: this.spent,
      remaining: this.maxTokens - this.spent,
      resetIn: this.windowMs - (Date.now() - this.windowStart)
    };
  }
}
```

## Response Tracking

```typescript
class TokenTracker {
  private requestTokens = new Map<string, number>();
  private responseTokens = new Map<string, number>();
  
  trackRequest(requestId: string, tokens: number) {
    this.requestTokens.set(requestId, tokens);
  }
  
  trackResponse(requestId: string, tokens: number) {
    this.responseTokens.set(requestId, tokens);
  }
  
  getUsage(requestId: string): TokenUsage | null {
    const req = this.requestTokens.get(requestId);
    const res = this.responseTokens.get(requestId);
    
    if (req === undefined || res === undefined) return null;
    
    return {
      promptTokens: req,
      completionTokens: res,
      totalTokens: req + res
    };
  }
  
  // Aggregate usage over time window
  getAggregateUsage(windowMs: number = 60000): TokenUsage {
    const cutoff = Date.now() - windowMs;
    let prompt = 0;
    let completion = 0;
    
    for (const [id, tokens] of this.requestTokens) {
      // Track timestamps separately
      const timestamp = this.timestamps.get(id);
      if (timestamp && timestamp > cutoff) {
        prompt += tokens;
      }
    }
    
    for (const [id, tokens] of this.responseTokens) {
      const timestamp = this.timestamps.get(id);
      if (timestamp && timestamp > cutoff) {
        completion += tokens;
      }
    }
    
    return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
  }
}
```

## Provider-Specific Limits

```typescript
const PROVIDER_LIMITS = {
  'openai-gpt-4': {
    rpm: 500,
    tpm: 120000,
    maxConcurrent: 50
  },
  'openai-gpt-3.5-turbo': {
    rpm: 3000,
    tpm: 200000,
    maxConcurrent: 100
  },
  'anthropic-claude-3': {
    rpm: 100,
    tpm: 100000,
    maxConcurrent: 10
  },
  'google-gemini': {
    rpm: 60,
    tpm: 120000,
    maxConcurrent: 5
  }
} as const;

function getLimits(provider: string, model: string): RateLimitConfig {
  const key = `${provider}-${model}`;
  return PROVIDER_LIMITS[key as keyof typeof PROVIDER_LIMITS] || {
    rpm: 60,
    tpm: 60000,
    maxConcurrent: 10
  };
}
```

## Response Header Parsing

```typescript
class RateLimitParser {
  // Parse rate limit headers from OpenAI
  static parseOpenAI(response: Response): RateLimitStatus {
    const headers = {
      'x-ratelimit-limit-requests': response.headers.get('x-ratelimit-limit-requests'),
      'x-ratelimit-remaining-requests': response.headers.get('x-ratelimit-remaining-requests'),
      'x-ratelimit-limit-tokens': response.headers.get('x-ratelimit-limit-tokens'),
      'x-ratelimit-remaining-tokens': response.headers.get('x-ratelimit-remaining-tokens'),
      'x-ratelimit-reset-requests': response.headers.get('x-ratelimit-reset-requests'),
      'x-ratelimit-reset-tokens': response.headers.get('x-ratelimit-reset-tokens')
    };
    
    return {
      available: parseInt(headers['x-ratelimit-remaining-requests']) > 0,
      remaining: {
        rpm: parseInt(headers['x-ratelimit-remaining-requests']),
        tpm: parseInt(headers['x-ratelimit-remaining-tokens'])
      },
      resetAt: new Date(Date.now() + parseResetTime(headers['x-ratelimit-reset-requests']))
    };
  }
  
  // Parse Anthropic rate limit headers
  static parseAnthropic(response: Response): RateLimitStatus {
    const headers = {
      'anthropic-ratelimit-requests-limit': response.headers.get('anthropic-ratelimit-requests-limit'),
      'anthropic-ratelimit-requests-remaining': response.headers.get('anthropic-ratelimit-requests-remaining'),
      'anthropic-ratelimit-requests-reset': response.headers.get('anthropic-ratelimit-requests-reset')
    };
    
    return {
      available: parseInt(headers['anthropic-ratelimit-requests-remaining']) > 0,
      remaining: {
        rpm: parseInt(headers['anthropic-ratelimit-requests-remaining']),
        tpm: 0 // Anthropic doesn't expose TPM in headers
      },
      resetAt: new Date(parseInt(headers['anthropic-ratelimit-requests-reset']))
    };
  }
}

function parseResetTime(reset: string | null): number {
  if (!reset) return 60000;
  // Format: "2024-01-01T00:01:00Z" or "1000ms" or "60s"
  if (reset.endsWith('ms')) return parseInt(reset);
  if (reset.endsWith('s')) return parseInt(reset) * 1000;
  return new Date(reset).getTime() - Date.now();
}
```

## Circuit Breaker

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number = 5,
    private recoveryTimeout: number = 60000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.recoveryTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
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
  
  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
  
  getStatus() {
    return { state: this.state, failures: this.failures };
  }
}
```

## Budget Alerts

```typescript
class BudgetAlertManager {
  private listeners: Array<{
    threshold: number;
    callback: (usage: TokenUsage) => void;
  }> = [];
  
  onThreshold(threshold: number, callback: (usage: TokenUsage) => void) {
    this.listeners.push({ threshold, callback });
  }
  
  checkUsage(usage: TokenUsage, periodLimit: number) {
    const utilization = usage.totalTokens / periodLimit;
    
    for (const listener of this.listeners) {
      if (utilization >= listener.threshold) {
        listener.callback(usage);
      }
    }
  }
}

// Usage
const alerts = new BudgetAlertManager();

alerts.onThreshold(0.5, (usage) => {
  console.warn(`⚠️ 50% budget used: ${usage.totalTokens} tokens`);
  notifyOperations();
});

alerts.onThreshold(0.8, (usage) => {
  console.error(`🚨 80% budget used: ${usage.totalTokens} tokens`);
  scaleDown();
});

alerts.onThreshold(0.95, (usage) => {
  console.critical(`🛑 95% budget used: ${usage.totalTokens} tokens`);
  emergencyShutdown();
});
```

## Summary

Token and rate limit management involves:
1. **Accurate counting**: Token estimation and encoding-based counting
2. **Budget tracking**: Time-windowed token spending
3. **Header parsing**: Extracting limit info from provider responses
4. **Circuit breakers**: Preventing cascade failures
5. **Alert systems**: Proactive budget monitoring
