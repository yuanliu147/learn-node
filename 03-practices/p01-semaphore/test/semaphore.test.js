const { test, describe } = require('node:test');
const assert = require('node:assert');
const { Semaphore, WeightedSemaphore } = require('../src/semaphore');

describe('Semaphore', () => {
  test('allows acquiring up to maxConcurrency', async () => {
    const sem = new Semaphore(2);
    
    await sem.acquire();
    assert.strictEqual(sem.currentCount, 1);
    
    await sem.acquire();
    assert.strictEqual(sem.currentCount, 2);
  });

  test('blocks when at maxConcurrency', async () => {
    const sem = new Semaphore(1);
    let unblocked = false;

    await sem.acquire();
    
    const acquirePromise = sem.acquire().then(() => {
      unblocked = true;
    });

    // Give the promise a chance to execute
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.strictEqual(unblocked, false);

    sem.release();
    await acquirePromise;
    assert.strictEqual(unblocked, true);
  });

  test('withLock executes function and releases', async () => {
    const sem = new Semaphore(1);
    let executed = false;

    await sem.withLock(async () => {
      executed = true;
      assert.strictEqual(sem.currentCount, 1);
    });

    assert.strictEqual(executed, true);
    assert.strictEqual(sem.currentCount, 0);
  });

  test('withLock releases on error', async () => {
    const sem = new Semaphore(1);

    await assert.rejects(
      async () => {
        await sem.withLock(async () => {
          throw new Error('Test error');
        });
      },
      { message: 'Test error' }
    );

    assert.strictEqual(sem.currentCount, 0);
  });

  test('maintains FIFO order', async () => {
    const sem = new Semaphore(1);
    const order = [];

    await sem.acquire();

    // Queue three acquires
    sem.acquire().then(() => order.push(1));
    sem.acquire().then(() => order.push(2));
    sem.acquire().then(() => order.push(3));

    await new Promise(resolve => setTimeout(resolve, 20));

    assert.deepStrictEqual(order, []);

    sem.release();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepStrictEqual(order, [1]);

    sem.release();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepStrictEqual(order, [1, 2]);

    sem.release();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepStrictEqual(order, [1, 2, 3]);
  });

  test('throws on release when not acquired', () => {
    const sem = new Semaphore(1);

    assert.throws(
      () => sem.release(),
      { message: 'Cannot release: no permits are currently held' }
    );
  });

  test('throws on invalid maxConcurrency', () => {
    assert.throws(
      () => new Semaphore(0),
      { message: 'maxConcurrency must be at least 1' }
    );

    assert.throws(
      () => new Semaphore(-1),
      { message: 'maxConcurrency must be at least 1' }
    );
  });
});

describe('WeightedSemaphore', () => {
  test('allows acquiring multiple permits', async () => {
    const sem = new WeightedSemaphore(10);

    await sem.acquire(5);
    assert.strictEqual(sem.availablePermits, 5);

    await sem.acquire(3);
    assert.strictEqual(sem.availablePermits, 2);
  });

  test('blocks when insufficient permits', async () => {
    const sem = new WeightedSemaphore(5);
    let unblocked = false;

    await sem.acquire(5);
    
    const acquirePromise = sem.acquire(2).then(() => {
      unblocked = true;
    });

    await new Promise(resolve => setTimeout(resolve, 10));
    assert.strictEqual(unblocked, false);

    sem.release(5);
    await acquirePromise;
    assert.strictEqual(unblocked, true);
    assert.strictEqual(sem.availablePermits, 3);
  });

  test('processes queued requests when permits become available', async () => {
    const sem = new WeightedSemaphore(5);
    const order = [];

    // Acquire all 5 permits
    await sem.acquire(5);

    // Queue a request for 2 permits
    const p2 = sem.acquire(2).then(() => order.push('2'));

    // Queue a request for 3 permits
    const p3 = sem.acquire(3).then(() => order.push('3'));

    // Give promises a chance to be queued
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepStrictEqual(order, []);

    // Release 2 permits - should fulfill the 2-permit request first (FIFO)
    sem.release(2);
    await p2;
    assert.deepStrictEqual(order, ['2']);

    // Release 3 permits - should fulfill the 3-permit request
    sem.release(3);
    await p3;
    assert.deepStrictEqual(order, ['2', '3']);
  });

  test('throws on acquire exceeding max', async () => {
    const sem = new WeightedSemaphore(5);

    await assert.rejects(
      async () => sem.acquire(10),
      { message: 'Cannot acquire 10: exceeds max permits 5' }
    );
  });

  test('withLock uses permits correctly', async () => {
    const sem = new WeightedSemaphore(10);
    let executed = false;

    await sem.withLock(5, async () => {
      executed = true;
      assert.strictEqual(sem.availablePermits, 5);
    });

    assert.strictEqual(executed, true);
    assert.strictEqual(sem.availablePermits, 10);
  });
});
