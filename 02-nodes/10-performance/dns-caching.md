# DNS Caching

## Overview

DNS resolution adds latency to every new connection. Caching DNS lookups reduces this overhead significantly.

## DNS Resolution in Node.js

```javascript
// Every new connection triggers DNS lookup
const http = require('http');

// First call: ~5-50ms DNS + connection
// Subsequent calls: still DNS unless cached!
http.get('http://api.example.com/data', cb);
```

## The Problem

```
Without DNS Cache (per request):
  DNS Lookup (5-100ms) → TCP Connect → TLS → Request

With DNS Cache:
  Cache Hit (microseconds) → TCP Connect → TLS → Request
```

## Node.js DNS Cache Options

### 1.dns.lookup() with ttl

```javascript
const dns = require('dns');

// Lookup with caching (OS-level)
dns.lookup('example.com', { ttl: true }, (err, addr, family) => {
  console.log(addr);
});
```

### 2. Cache-Agent Pattern

```javascript
const dnsCache = new Map();

async function cachedLookup(hostname) {
  if (dnsCache.has(hostname)) {
    return dnsCache.get(hostname);
  }
  
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, (err, address) => {
      if (err) return reject(err);
      dnsCache.set(hostname, { address, timestamp: Date.now() });
      resolve(address);
    });
  });
}
```

### 3. Using cacheable-lookup

```javascript
const CacheableLookup = require('cacheable-lookup');
const dns = require('dns');

const cacheable = new CacheableLookup();
cacheable.install(dns);

// Now all dns.lookup() calls use cache
dns.lookup('example.com', (err, addr) => {
  console.log(addr);  // Cached!
});
```

## HTTP Agent DNS Caching

### http.Agent

```javascript
const http = require('http');

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 10,      // Per host
  maxFreeSockets: 5,   // Keep warm
  timeout: 60000,
});

// Reuses connections, but still does DNS
http.get({ hostname: 'api.example.com', agent }, cb);
```

### Using keepAlive + DNS cache

```javascript
const CacheableLookup = require('cacheable-lookup');
const https = require('https');

const cacheable = new CacheableLookup();
cacheable.install(https.globalAgent);

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 25,
});

https.get({ hostname: 'api.example.com', agent }, cb);
```

## Setting TTL Values

```javascript
const dnsCache = new Map();

// 5 minute TTL
const DNS_TTL = 5 * 60 * 1000;

async function cachedLookup(hostname) {
  const cached = dnsCache.get(hostname);
  
  if (cached && Date.now() - cached.timestamp < DNS_TTL) {
    return cached.address;
  }
  
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, (err, address) => {
      if (err) {
        // Return stale cache on error
        if (cached) return resolve(cached.address);
        return reject(err);
      }
      dnsCache.set(hostname, { address, timestamp: Date.now() });
      resolve(address);
    });
  });
}
```

## DNS Prefetch

```javascript
// On server startup
const hosts = [
  'api.example.com',
  'cdn.example.com',
  'auth.example.com',
];

hosts.forEach(host => {
  dns.lookup(host, (err) => {
    if (!err) console.log(`Prefetched: ${host}`);
  });
});
```

## Negative Caching

```javascript
const negativeCache = new Map();
const NEGATIVE_TTL = 60 * 1000;  // Short TTL for failures

async function robustLookup(hostname) {
  // Check negative cache
  const neg = negativeCache.get(hostname);
  if (neg && Date.now() - neg.timestamp < NEGATIVE_TTL) {
    throw new Error(`DNS lookup failed: ${hostname}`);
  }
  
  try {
    return await cachedLookup(hostname);
  } catch (err) {
    // Cache failures briefly
    negativeCache.set(hostname, { timestamp: Date.now() });
    throw err;
  }
}
```

## Best Practices

1. **Cache successful lookups** (5-10 min TTL)
2. **Set shorter TTL for negative results** (30-60s)
3. **Limit cache size** to prevent memory leaks
4. **Warm cache on startup** for known hosts
5. **Monitor cache hit rates**

## Cache Size Management

```javascript
const dnsCache = new Map();
const MAX_CACHE_SIZE = 1000;

function setCache(hostname, address) {
  // Evict oldest if at capacity
  if (dnsCache.size >= MAX_CACHE_SIZE) {
    const oldest = dnsCache.keys().next().value;
    dnsCache.delete(oldest);
  }
  dnsCache.set(hostname, { address, timestamp: Date.now() });
}
```

## Quick Reference

| Strategy | TTL | Use Case |
|----------|-----|----------|
| High traffic | 5-10 min | APIs, CDNs |
| Low traffic | 1-5 min | Regular websites |
| Negative cache | 30-60s | Any |
| Development | 0 | Testing changes |
