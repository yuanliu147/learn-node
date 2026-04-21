/**
 * LLM Adapter Interface
 * All adapters must implement these methods
 */
class LLMAdapter {
  async generate(prompt, options = {}) {
    throw new Error('Not implemented');
  }

  async *stream(prompt, options = {}) {
    throw new Error('Not implemented');
  }

  async embed(text) {
    throw new Error('Not implemented');
  }

  async listModels() {
    throw new Error('Not implemented');
  }

  async ping() {
    throw new Error('Not implemented');
  }
}

/**
 * OpenAI-compatible Adapter
 */
class OpenAIAdapter extends LLMAdapter {
  constructor(apiKey, options = {}) {
    super();
    this.apiKey = apiKey;
    this.baseURL = options.baseURL || 'https://api.openai.com/v1';
    this.defaultModel = options.defaultModel || 'gpt-3.5-turbo';
  }

  async generate(prompt, options = {}) {
    const model = options.model || this.defaultModel;
    
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        top_p: options.topP,
        stop: options.stop
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens
      },
      raw: data
    };
  }

  async *stream(prompt, options = {}) {
    const model = options.model || this.defaultModel;
    
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield { content: '', done: true };
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield { content, done: false };
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }

    yield { content: '', done: true };
  }

  async embed(text) {
    const texts = Array.isArray(text) ? text : [text];
    
    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: texts
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI Embeddings error ${response.status}`);
    }

    const data = await response.json();
    return texts.map((_, i) => data.data[i].embedding);
  }

  async listModels() {
    const response = await fetch(`${this.baseURL}/models`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}`);
    }

    const data = await response.json();
    return data.data.map(m => ({
      id: m.id,
      owned_by: m.owned_by,
      created: m.created
    }));
  }

  async ping() {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'HEAD',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Anthropic Adapter
 */
class AnthropicAdapter extends LLMAdapter {
  constructor(apiKey, options = {}) {
    super();
    this.apiKey = apiKey;
    this.baseURL = options.baseURL || 'https://api.anthropic.com/v1';
    this.defaultModel = options.defaultModel || 'claude-3-haiku-20240307';
  }

  async generate(prompt, options = {}) {
    const model = options.model || this.defaultModel;
    
    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 1024
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      model: data.model,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens
      },
      raw: data
    };
  }

  async *stream(prompt, options = {}) {
    const model = options.model || this.defaultModel;
    
    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 1024
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta') {
            yield { content: data.delta.text, done: false };
          } else if (data.type === 'message_delta') {
            yield { content: '', done: true };
          }
        }
      }
    }
  }

  async ping() {
    try {
      await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        })
      });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = {
  LLMAdapter,
  OpenAIAdapter,
  AnthropicAdapter
};
