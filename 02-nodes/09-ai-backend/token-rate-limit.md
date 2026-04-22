# Token 与限流管理

## 概述

LLM API 在多个层面施加限制 —— 每分钟请求数（RPM）、每分钟 token 数（TPM）和并发连接数。有效地管理这些限制对生产级 AI 应用至关重要。

## 限流结构

```typescript
interface RateLimitConfig {
  rpm: number;           // 每分钟请求数
  tpm: number;           // 每分钟 token 数  
  maxConcurrent: number; // 同时连接数
  cooldownMs: number;    // 收到 429 后的等待时间
}

interface RateLimitStatus {
  available: boolean;
  remaining: { rpm: number; tpm: number; concurrent: number };
  resetAt: Date;
}
```

## Token 计数

### Prompt Token 估算

```typescript
class TokenCounter {
  // 使用基于词的估算来近似 token 数
  static estimate(text: string): number {
    // 粗略估算：英文约每词 0.75 个 token
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words / 0.75);
  }
  
  // 使用类 tiktoken 编码更精确
  static async countOpenAI(text: string, model = 'gpt-4'): Promise<number> {
    const encoder = await getEncoder('cl100k_base'); // OpenAI 的编码
    return encoder.encode(text).length;
  }
  
  // 计算带消息格式的 prompt
  static async countMessages(messages: Message[], model: string): Promise<number> {
    const encoded = await Promise.all(
      messages.map(m => this.countOpenAI(m.content, model))
    );
    
    // 每条消息约 4 tokens 的开销
    return encoded.reduce((sum, count) => sum + count + 4, 0);
  }
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

### Token 预算管理

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

## 响应追踪

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
  
  // 聚合时间窗口内的使用量
  getAggregateUsage(windowMs: number = 60000): TokenUsage {
    const cutoff = Date.now() - windowMs;
    let prompt = 0;
    let completion = 0;
    
    for (const [id, tokens] of this.requestTokens) {
      // 单独追踪时间戳
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

## 各提供商限制

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

## 响应头解析

```typescript
class RateLimitParser {
  // 解析 OpenAI 的限流头
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
  
  // 解析 Anthropic 的限流头
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
        tpm: 0 // Anthropic 未在头中暴露 TPM
      },
      resetAt: new Date(parseInt(headers['anthropic-ratelimit-requests-reset']))
    };
  }
}

function parseResetTime(reset: string | null): number {
  if (!reset) return 60000;
  // 格式："2024-01-01T00:01:00Z" 或 "1000ms" 或 "60s"
  if (reset.endsWith('ms')) return parseInt(reset);
  if (reset.endsWith('s')) return parseInt(reset) * 1000;
  return new Date(reset).getTime() - Date.now();
}
```

## 熔断器

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

## 预算告警

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

// 使用示例
const alerts = new BudgetAlertManager();

alerts.onThreshold(0.5, (usage) => {
  console.warn(`⚠️ 已使用 50% 预算: ${usage.totalTokens} tokens`);
  notifyOperations();
});

alerts.onThreshold(0.8, (usage) => {
  console.error(`🚨 已使用 80% 预算: ${usage.totalTokens} tokens`);
  scaleDown();
});

alerts.onThreshold(0.95, (usage) => {
  console.critical(`🛑 已使用 95% 预算: ${usage.totalTokens} tokens`);
  emergencyShutdown();
});
```

## 总结

Token 和限流管理涉及：
1. **精确计数**：Token 估算和基于编码的计数
2. **预算追踪**：基于时间窗口的 token 消费
3. **响应头解析**：从提供商响应中提取限制信息
4. **熔断器**：防止级联故障
5. **告警系统**：主动预算监控
