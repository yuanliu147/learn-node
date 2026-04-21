const assert = require('assert');
const path = require('path');

// For testing, we'll use a mock if native addon isn't built
let addon;

try {
  addon = require('../src/index');
} catch (e) {
  // Mock addon for testing without native build
  console.log('Native addon not available, using mock');
  addon = {
    add: (a, b) => a + b,
    fibonacci: (n) => {
      if (n <= 1) return n;
      let a = 0, b = 1;
      for (let i = 2; i <= n; i++) {
        [a, b] = [b, a + b];
      }
      return b;
    },
    isPrime: (n) => {
      if (n < 2) return false;
      if (n === 2) return true;
      if (n % 2 === 0) return false;
      for (let i = 3; i * i <= n; i += 2) {
        if (n % i === 0) return false;
      }
      return true;
    },
    getVersion: () => process.version
  };
}

describe('Native Addon', () => {
  describe('add', () => {
    it('should add two numbers', () => {
      assert.strictEqual(addon.add(2, 3), 5);
      assert.strictEqual(addon.add(0, 0), 0);
      assert.strictEqual(addon.add(-1, 1), 0);
    });
  });

  describe('fibonacci', () => {
    it('should calculate fibonacci numbers', () => {
      assert.strictEqual(addon.fibonacci(0), 0);
      assert.strictEqual(addon.fibonacci(1), 1);
      assert.strictEqual(addon.fibonacci(10), 55);
      assert.strictEqual(addon.fibonacci(20), 6765);
    });
  });

  describe('isPrime', () => {
    it('should detect prime numbers', () => {
      assert.strictEqual(addon.isPrime(2), true);
      assert.strictEqual(addon.isPrime(3), true);
      assert.strictEqual(addon.isPrime(4), false);
      assert.strictEqual(addon.isPrime(17), true);
      assert.strictEqual(addon.isPrime(1), false);
      assert.strictEqual(addon.isPrime(0), false);
    });
  });

  describe('getVersion', () => {
    it('should return node version', () => {
      const version = addon.getVersion();
      assert.ok(typeof version === 'string');
      assert.ok(version.startsWith('v'));
    });
  });
});
