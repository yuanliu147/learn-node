const { test, describe, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const { LLMAdapter, OpenAIAdapter, AnthropicAdapter } = require('../src/adapters');
const { LLMProxy } = require('../src/proxy');

describe('LLMAdapter', () => {
  test('base class throws on generate', async () => {
    const adapter = new LLMAdapter();
    
    await assert.rejects(
      async () => adapter.generate('test'),
      { message: 'Not implemented' }
    );
  });

  test('base class throws on stream', async () => {
    const adapter = new LLMAdapter();
    
    await assert.rejects(
      async () => adapter.stream('test').next(),
      { message: 'Not implemented' }
    );
  });
});

describe('OpenAIAdapter', () => {
  test('requires api key', () => {
    const adapter = new OpenAIAdapter('test-key');
    assert.strictEqual(adapter.apiKey, 'test-key');
  });

  test('uses default base URL', () => {
    const adapter = new OpenAIAdapter('test-key');
    assert.strictEqual(adapter.baseURL, 'https://api.openai.com/v1');
  });

  test('allows custom base URL', () => {
    const adapter = new OpenAIAdapter('test-key', {
      baseURL: 'https://custom.api.com/v1'
    });
    assert.strictEqual(adapter.baseURL, 'https://custom.api.com/v1');
  });

  test('uses default model', () => {
    const adapter = new OpenAIAdapter('test-key');
    assert.strictEqual(adapter.defaultModel, 'gpt-3.5-turbo');
  });

  test('generates correct request body', async () => {
    const adapter = new OpenAIAdapter('test-key');
    
    // Mock fetch to capture the request
    const mockFetch = mock.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      assert.strictEqual(body.model, 'gpt-4');
      assert.strictEqual(body.messages[0].content, 'Hello');
      assert.strictEqual(body.temperature, 0.5);
      
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hi there!' } }],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
        })
      };
    });

    global.fetch = mockFetch;
    
    const result = await adapter.generate('Hello', {
      model: 'gpt-4',
      temperature: 0.5
    });

    assert.strictEqual(result.content, 'Hi there!');
    assert.strictEqual(result.usage.totalTokens, 8);
    
    mockFetch.mock.restore();
    delete global.fetch;
  });

  test('throws on API error', async () => {
    const adapter = new OpenAIAdapter('test-key');
    
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key'
    }));

    global.fetch = mockFetch;

    await assert.rejects(
      async () => adapter.generate('Hello'),
      { message: 'OpenAI API error 401: Invalid API key' }
    );
    
    mockFetch.mock.restore();
    delete global.fetch;
  });
});

describe('AnthropicAdapter', () => {
  test('requires api key', () => {
    const adapter = new AnthropicAdapter('test-key');
    assert.strictEqual(adapter.apiKey, 'test-key');
  });

  test('uses correct base URL', () => {
    const adapter = new AnthropicAdapter('test-key');
    assert.strictEqual(adapter.baseURL, 'https://api.anthropic.com/v1');
  });

  test('uses correct default model', () => {
    const adapter = new AnthropicAdapter('test-key');
    assert.strictEqual(adapter.defaultModel, 'claude-3-haiku-20240307');
  });

  test('includes anthropic version header', async () => {
    const adapter = new AnthropicAdapter('test-key');
    
    const mockFetch = mock.fn(async (url, options) => {
      assert.strictEqual(options.headers['anthropic-version'], '2023-06-01');
      assert.strictEqual(options.headers['x-api-key'], 'test-key');
      
      return {
        ok: true,
        json: async () => ({
          content: [{ text: 'Claude response' }],
          model: 'claude-3',
          usage: { input_tokens: 5, output_tokens: 10 }
        })
      };
    });

    global.fetch = mockFetch;
    
    const result = await adapter.generate('Hello');
    
    assert.strictEqual(result.content, 'Claude response');
    
    mockFetch.mock.restore();
    delete global.fetch;
  });
});

describe('LLMProxy', () => {
  test('can be created with no adapters', () => {
    const proxy = new LLMProxy();
    assert.deepStrictEqual(proxy.adapters, {});
  });

  test('can be created with adapters', () => {
    const adapter = new OpenAIAdapter('key');
    const proxy = new LLMProxy({ openai: adapter });
    assert.strictEqual(proxy.adapters.openai, adapter);
  });

  test('selectAdapter returns first adapter when no model specified', () => {
    const adapter1 = new OpenAIAdapter('key1');
    const adapter2 = new AnthropicAdapter('key2');
    const proxy = new LLMProxy({ openai: adapter1, anthropic: adapter2 });
    
    assert.strictEqual(proxy.selectAdapter(), adapter1);
  });

  test('selectAdapter matches by prefix', () => {
    const adapter1 = new OpenAIAdapter('key1');
    const adapter2 = new AnthropicAdapter('key2');
    const proxy = new LLMProxy({ openai: adapter1, anthropic: adapter2 });
    
    assert.strictEqual(proxy.selectAdapter('anthropic:claude-3'), adapter2);
  });

  test('selectAdapter throws when no adapters', () => {
    const proxy = new LLMProxy();
    
    assert.throws(
      () => proxy.selectAdapter(),
      { message: 'No adapters configured' }
    );
  });

  test('stripModelPrefix removes provider prefix', () => {
    const proxy = new LLMProxy();
    
    assert.strictEqual(proxy.stripModelPrefix('openai:gpt-4'), 'gpt-4');
    assert.strictEqual(proxy.stripModelPrefix('anthropic:claude-3'), 'claude-3');
    assert.strictEqual(proxy.stripModelPrefix('gpt-4'), 'gpt-4');
    assert.strictEqual(proxy.stripModelPrefix(null), null);
  });

  test('generate increments metrics', async () => {
    const mockAdapter = {
      async generate(prompt, options) {
        return { content: 'test response' };
      }
    };
    const proxy = new LLMProxy({ test: mockAdapter });
    
    await proxy.generate('Hello');
    
    assert.strictEqual(proxy.metrics.requests, 1);
    assert.strictEqual(proxy.metrics.errors, 0);
  });

  test('generate tracks tokens', async () => {
    const mockAdapter = {
      async generate(prompt, options) {
        return { 
          content: 'test',
          usage: { totalTokens: 100 }
        };
      }
    };
    const proxy = new LLMProxy({ test: mockAdapter });
    
    await proxy.generate('Hello');
    
    assert.strictEqual(proxy.metrics.tokens, 100);
  });

  test('generate uses caching when enabled', async () => {
    let callCount = 0;
    const mockAdapter = {
      async generate(prompt, options) {
        callCount++;
        return { content: `response ${callCount}` };
      }
    };
    
    const proxy = new LLMProxy({ test: mockAdapter }, { cache: true });
    
    // First call
    const result1 = await proxy.generate('Hello');
    assert.strictEqual(callCount, 1);
    assert.strictEqual(result1.cached, undefined);

    // Second call should be cached
    const result2 = await proxy.generate('Hello');
    assert.strictEqual(callCount, 1); // Not called again
    assert.strictEqual(result2.cached, true);
    
    // Different prompt should miss cache
    await proxy.generate('World');
    assert.strictEqual(callCount, 2);
    
    // Metrics
    assert.strictEqual(proxy.metrics.cacheHits, 1);
    assert.strictEqual(proxy.metrics.cacheMisses, 2);
  });

  test('clearCache removes all cached items', async () => {
    const mockAdapter = {
      async generate(prompt, options) {
        return { content: 'test' };
      }
    };
    
    const proxy = new LLMProxy({ test: mockAdapter }, { cache: true });
    
    await proxy.generate('Hello');
    await proxy.generate('Hello');
    assert.strictEqual(proxy.cache.size, 1);
    
    proxy.clearCache();
    assert.strictEqual(proxy.cache.size, 0);
  });

  test('healthCheck checks all adapters', async () => {
    const mockAdapter1 = {
      async ping() { return true; }
    };
    const mockAdapter2 = {
      async ping() { return false; }
    };
    
    const proxy = new LLMProxy({ good: mockAdapter1, bad: mockAdapter2 });
    
    const health = await proxy.healthCheck();
    
    assert.strictEqual(health.healthy, true);
    assert.strictEqual(health.adapters.good, true);
    assert.strictEqual(health.adapters.bad, false);
  });

  test('getMetrics returns copy of metrics', async () => {
    const proxy = new LLMProxy();
    const metrics = proxy.getMetrics();
    
    metrics.requests = 999; // Should not affect internal state
    
    assert.strictEqual(proxy.metrics.requests, 0);
  });

  test('resetMetrics clears all counters', async () => {
    const proxy = new LLMProxy();
    proxy.metrics.requests = 10;
    proxy.metrics.tokens = 100;
    proxy.metrics.errors = 5;
    
    proxy.resetMetrics();
    
    assert.deepStrictEqual(proxy.metrics, {
      requests: 0,
      tokens: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0
    });
  });

  test('addAdapter adds new adapter', () => {
    const proxy = new LLMProxy();
    const adapter = new OpenAIAdapter('key');
    
    proxy.addAdapter('openai', adapter);
    
    assert.strictEqual(proxy.adapters.openai, adapter);
  });

  test('removeAdapter removes adapter', () => {
    const adapter = new OpenAIAdapter('key');
    const proxy = new LLMProxy({ openai: adapter });
    
    proxy.removeAdapter('openai');
    
    assert.strictEqual(proxy.adapters.openai, undefined);
  });

  test('setCacheEnabled toggles caching', () => {
    const proxy = new LLMProxy({}, { cache: false });
    
    assert.strictEqual(proxy.cacheEnabled, false);
    
    proxy.setCacheEnabled(true);
    assert.strictEqual(proxy.cacheEnabled, true);
  });

  test('stream yields from adapter', async () => {
    async function* mockStream() {
      yield { content: 'Hello', done: false };
      yield { content: ' world', done: false };
      yield { content: '', done: true };
    }
    
    const mockAdapter = {
      async *stream() {
        yield* mockStream();
      }
    };
    
    const proxy = new LLMProxy({ test: mockAdapter });
    
    const chunks = [];
    for await (const chunk of proxy.stream('Hello')) {
      chunks.push(chunk);
    }
    
    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(chunks[0].content, 'Hello');
    assert.strictEqual(chunks[1].content, ' world');
    assert.strictEqual(chunks[2].done, true);
  });
});
