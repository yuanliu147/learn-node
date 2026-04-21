const { LLMAdapter } = require('./adapters');

/**
 * LLM Proxy - unified interface for multiple LLM providers
 */
class LLMProxy {
  /**
   * @param {Object} adapters - Map of adapter name to adapter instance
   * @param {Object} options - Configuration options
   */
  constructor(adapters = {}, options = {}) {
    this.adapters = adapters;
    this.cache = new Map();
    this.cacheEnabled = options.cache ?? false;
    this.cacheTTL = options.cacheTTL ?? 3600000; // 1 hour
    this.metrics = {
      requests: 0,
      tokens: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Select the best adapter for the given model
   * @param {string} model - Model identifier
   * @returns {LLMAdapter}
   */
  selectAdapter(model) {
    if (!model) {
      const firstAdapter = Object.values(this.adapters)[0];
      if (!firstAdapter) {
        throw new Error('No adapters configured');
      }
      return firstAdapter;
    }

    // Try to match by model prefix (e.g., "openai:gpt-4" -> openai adapter)
    for (const [name, adapter] of Object.entries(this.adapters)) {
      if (model.startsWith(`${name}:`) || model.startsWith(name)) {
        return adapter;
      }
    }

    // Default to first available adapter
    const firstAdapter = Object.values(this.adapters)[0];
    if (!firstAdapter) {
      throw new Error('No adapters configured');
    }
    return firstAdapter;
  }

  /**
   * Strip provider prefix from model name
   * @param {string} model
   * @returns {string}
   */
  stripModelPrefix(model) {
    if (!model) return model;
    const colonIndex = model.indexOf(':');
    return colonIndex !== -1 ? model.slice(colonIndex + 1) : model;
  }

  /**
   * Generate a response (non-streaming)
   * @param {string} prompt
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async generate(prompt, options = {}) {
    this.metrics.requests++;

    // Check cache
    if (this.cacheEnabled) {
      const cacheKey = this.getCacheKey(prompt, options);
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        this.metrics.cacheHits++;
        return { ...cached.result, cached: true };
      }
      this.metrics.cacheMisses++;
    }

    const adapter = this.selectAdapter(options.model);
    const modelOptions = { ...options, model: this.stripModelPrefix(options.model) };

    try {
      const result = await adapter.generate(prompt, modelOptions);
      
      if (result.usage?.totalTokens) {
        this.metrics.tokens += result.usage.totalTokens;
      }

      if (this.cacheEnabled) {
        const cacheKey = this.getCacheKey(prompt, options);
        this.cache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }

      return result;
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Stream a response
   * @param {string} prompt
   * @param {Object} options
   * @returns {AsyncGenerator}
   */
  async *stream(prompt, options = {}) {
    this.metrics.requests++;

    const adapter = this.selectAdapter(options.model);
    const modelOptions = { ...options, model: this.stripModelPrefix(options.model) };

    try {
      yield* adapter.stream(prompt, modelOptions);
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Get embeddings for text
   * @param {string|string[]} text
   * @param {Object} options
   * @returns {Promise<number[][]>}
   */
  async embed(text, options = {}) {
    this.metrics.requests++;

    const adapter = this.selectAdapter(options.model);
    try {
      return await adapter.embed(text);
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Generate embeddings with caching
   * @param {string|string[]} text
   * @param {Object} options
   * @returns {Promise<number[][]>}
   */
  async embedWithCache(text, options = {}) {
    const cacheKey = `embed:${JSON.stringify({ text, options })}`;
    
    if (this.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        this.metrics.cacheHits++;
        return cached.result;
      }
      this.metrics.cacheMisses++;
    }

    const result = await this.embed(text, options);
    
    if (this.cacheEnabled) {
      this.cache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
    }

    return result;
  }

  /**
   * Get cache key for prompt/options combination
   * @param {string} prompt
   * @param {Object} options
   * @returns {string}
   */
  getCacheKey(prompt, options) {
    return JSON.stringify({ prompt, options: { ...options, model: undefined } });
  }

  /**
   * List available models across all adapters
   * @returns {Promise<Object[]>}
   */
  async listModels() {
    const allModels = [];
    
    for (const [name, adapter] of Object.entries(this.adapters)) {
      try {
        const models = await adapter.listModels();
        allModels.push(...models.map(m => ({ ...m, provider: name })));
      } catch (error) {
        console.warn(`Failed to list models for ${name}:`, error.message);
      }
    }
    
    return allModels;
  }

  /**
   * Check health of all adapters
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    const results = {};
    
    for (const [name, adapter] of Object.entries(this.adapters)) {
      try {
        results[name] = await adapter.ping();
      } catch {
        results[name] = false;
      }
    }
    
    return {
      healthy: Object.values(results).some(v => v),
      adapters: results,
      metrics: { ...this.metrics }
    };
  }

  /**
   * Get current metrics
   * @returns {Object}
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      requests: 0,
      tokens: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Enable/disable caching
   * @param {boolean} enabled
   */
  setCacheEnabled(enabled) {
    this.cacheEnabled = enabled;
  }

  /**
   * Add or replace an adapter
   * @param {string} name
   * @param {LLMAdapter} adapter
   */
  addAdapter(name, adapter) {
    this.adapters[name] = adapter;
  }

  /**
   * Remove an adapter
   * @param {string} name
   */
  removeAdapter(name) {
    delete this.adapters[name];
  }
}

module.exports = { LLMProxy };
