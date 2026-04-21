/**
 * Basic Semaphore implementation for concurrency control
 */
class Semaphore {
  /**
   * @param {number} maxConcurrency - Maximum concurrent permits
   */
  constructor(maxConcurrency) {
    if (maxConcurrency < 1) {
      throw new Error('maxConcurrency must be at least 1');
    }
    this.maxConcurrency = maxConcurrency;
    this.current = 0;
    this.queue = [];
  }

  /**
   * Acquire a permit from the semaphore
   * @returns {Promise<void>}
   */
  async acquire() {
    if (this.current < this.maxConcurrency) {
      this.current++;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release a permit back to the semaphore
   */
  release() {
    if (this.current === 0) {
      throw new Error('Cannot release: no permits are currently held');
    }

    this.current--;

    if (this.queue.length > 0) {
      this.current++;
      const next = this.queue.shift();
      next();
    }
  }

  /**
   * Execute a function with semaphore protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} - Result of the function
   */
  async withLock(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Get current number of active permits
   * @returns {number}
   */
  get currentCount() {
    return this.current;
  }

  /**
   * Get number of waiting acquire calls
   * @returns {number}
   */
  get queueLength() {
    return this.queue.length;
  }
}

/**
 * Weighted Semaphore - allows acquiring multiple permits at once
 */
class WeightedSemaphore {
  /**
   * @param {number} maxPermits - Total available permits
   */
  constructor(maxPermits) {
    if (maxPermits < 1) {
      throw new Error('maxPermits must be at least 1');
    }
    this.maxPermits = maxPermits;
    this.available = maxPermits;
    this.queue = [];
  }

  /**
   * Acquire permits from the semaphore
   * @param {number} permits - Number of permits to acquire
   * @returns {Promise<void>}
   */
  async acquire(permits = 1) {
    if (permits > this.maxPermits) {
      throw new Error(`Cannot acquire ${permits}: exceeds max permits ${this.maxPermits}`);
    }

    if (this.available >= permits) {
      this.available -= permits;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push({ permits, resolve });
    });
  }

  /**
   * Release permits back to the semaphore
   * @param {number} permits - Number of permits to release
   */
  release(permits = 1) {
    this.available += permits;

    // Process queued requests in FIFO order
    while (this.queue.length > 0 && this.available >= this.queue[0].permits) {
      const next = this.queue.shift();
      this.available -= next.permits;
      next.resolve();
    }
  }

  /**
   * Execute a function with weighted semaphore protection
   * @param {number} permits - Permits required
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>}
   */
  async withLock(permits, fn) {
    await this.acquire(permits);
    try {
      return await fn();
    } finally {
      this.release(permits);
    }
  }

  /**
   * Get available permits
   * @returns {number}
   */
  get availablePermits() {
    return this.available;
  }

  /**
   * Get number of waiting acquire calls
   * @returns {number}
   */
  get queueLength() {
    return this.queue.length;
  }
}

module.exports = { Semaphore, WeightedSemaphore };
