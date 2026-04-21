const assert = require('assert');
const { WorkerPool } = require('../src/pool');
const { TaskQueue, fibonacci, isPrime, findPrimes } = require('../src/tasks');

describe('Worker Pool', () => {
  let pool;

  after(async () => {
    if (pool) {
      await pool.shutdown();
    }
  });

  describe('TaskQueue', () => {
    it('should enqueue and dequeue tasks', () => {
      const queue = new TaskQueue();
      queue.enqueue({ id: 1 });
      queue.enqueue({ id: 2 });
      
      assert.strictEqual(queue.size(), 2);
      assert.strictEqual(queue.dequeue().id, 1);
      assert.strictEqual(queue.size(), 1);
    });

    it('should throw when full', () => {
      const queue = new TaskQueue(2);
      queue.enqueue({ id: 1 });
      queue.enqueue({ id: 2 });
      
      assert.throws(() => queue.enqueue({ id: 3 }), /full/);
    });
  });

  describe('Task handlers', () => {
    it('should calculate fibonacci', () => {
      assert.strictEqual(fibonacci(0), 0);
      assert.strictEqual(fibonacci(1), 1);
      assert.strictEqual(fibonacci(10), 55);
    });

    it('should detect primes', () => {
      assert.strictEqual(isPrime(2), true);
      assert.strictEqual(isPrime(4), false);
      assert.strictEqual(isPrime(17), true);
    });

    it('should find primes in range', () => {
      const primes = findPrimes(1, 10);
      assert.deepStrictEqual(primes, [2, 3, 5, 7]);
    });
  });

  describe('WorkerPool', () => {
    it('should create pool with specified size', async () => {
      pool = new WorkerPool(2);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = pool.getStats();
      assert.strictEqual(stats.total, 2);
      assert.ok(stats.ready >= 0);
    });

    it('should run a simple task', async () => {
      pool = new WorkerPool(2);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await pool.runTask({ type: 'echo', data: 'hello' });
      assert.strictEqual(result, 'hello');
    });

    it('should run multiple tasks', async () => {
      pool = new WorkerPool(2);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const tasks = [
        { type: 'echo', data: 1 },
        { type: 'echo', data: 2 },
        { type: 'echo', data: 3 }
      ];
      
      const results = await pool.runTasks(tasks);
      assert.deepStrictEqual(results, [1, 2, 3]);
    });

    it('should handle fibonacci task', async () => {
      pool = new WorkerPool(2);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await pool.runTask({ type: 'fibonacci', data: { n: 10 } });
      assert.strictEqual(result, 55);
    });
  });
});
