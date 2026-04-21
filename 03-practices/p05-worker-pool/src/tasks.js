/**
 * Task handlers for worker pool
 */

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function isPrime(num) {
  if (num < 2) return false;
  for (let i = 2; i <= Math.sqrt(num); i++) {
    if (num % i === 0) return false;
  }
  return true;
}

function findPrimes(start, end) {
  const primes = [];
  for (let i = start; i <= end; i++) {
    if (isPrime(i)) primes.push(i);
  }
  return primes;
}

function heavyComputation(data) {
  // Simulate CPU-intensive work
  const { iterations = 1000, value = 1000 } = data;
  let result = value;
  
  for (let i = 0; i < iterations; i++) {
    result = (result * 3 + 1) % 1000000;
  }
  
  return {
    original: value,
    iterations,
    result
  };
}

function batchProcess(items) {
  return items.map(item => ({
    id: item.id,
    processed: true,
    value: item.value * 2
  }));
}

const taskHandlers = {
  fibonacci: (data) => Promise.resolve(fibonacci(data.n || 10)),
  findPrimes: (data) => Promise.resolve(findPrimes(data.start || 1, data.end || 100)),
  compute: heavyComputation,
  batch: batchProcess,
  echo: (data) => Promise.resolve(data)
};

class TaskQueue {
  constructor(maxSize = 1000) {
    this.queue = [];
    this.maxSize = maxSize;
  }

  enqueue(task) {
    if (this.queue.length >= this.maxSize) {
      throw new Error('Task queue is full');
    }
    this.queue.push(task);
  }

  dequeue() {
    return this.queue.shift();
  }

  isEmpty() {
    return this.queue.length === 0;
  }

  size() {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
  }
}

module.exports = {
  taskHandlers,
  TaskQueue,
  fibonacci,
  isPrime,
  findPrimes,
  heavyComputation,
  batchProcess
};
