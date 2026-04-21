# Connection Pool Tuning

## Overview

Connection pooling maintains a cache of database connections that can be reused, reducing the overhead of creating new connections for each request.

## Why Connection Pools Matter

```
Without Pool:                    With Pool:
Request → Create Conn → Query    Request → Get Conn → Query
Request → Create Conn → Query    Request → Get Conn → Query
Request → Create Conn → Query    Request → Get Conn → Query
         ↑ Each takes 50-500ms             ↑ Milliseconds
```

## Core Parameters

### 1. Pool Size

```javascript
const pool = {
  min: 2,           // Always keep 2 connections
  max: 10,          // Maximum connections
}
```

**Formula:**
```
Optimal = (Core_Count * 2) + Effective_Spindle_Count
```

### 2. Connection Timeout

```javascript
{
  connectionTimeoutMillis: 2000,  // Wait 2s to acquire
  idleTimeoutMillis: 30000,       // Close idle after 30s
}
```

### 3. Queue Limit

```javascript
{
  // Max requests waiting for connection
  // '0' = unlimited, '100' = reasonable limit
}
```

## Pool Sizing Guide

| Workload | min | max | Use Case |
|----------|-----|-----|----------|
| Low | 1 | 5 | Dev/test |
| Medium | 2 | 20 | API servers |
| High | 5 | 50 | Data intensive |
| Very High | 10+ | 100+ | GPU/large datasets |

## Node.js Pool Implementation

### Using pg (PostgreSQL)

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  database: 'myapp',
  user: 'admin',
  password: 'secret',
  min: 5,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Query with automatic release
const result = await pool.query('SELECT * FROM users');
// Connection automatically returned to pool
```

### Manual acquire/release

```javascript
const client = await pool.connect();
try {
  const result = await client.query('BEGIN');
  await client.query('INSERT INTO users VALUES ($1)', [id]);
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();  // Always release!
}
```

### Connection leak prevention

```javascript
const pool = new Pool({
  max: 20,
  // Log when connections are checked out too long
  idleTimeoutMillis: 30000,
  // Ensures connections are tested on return
  allowExitOnIdle: false,
});
```

## Monitoring Pool Health

```javascript
setInterval(() => {
  console.log({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
}, 10000);
```

**Key Metrics:**
- `totalCount`: Total connections in pool
- `idleCount`: Available connections (should be > 0)
- `waitingCount`: Requests waiting for connection (should be 0)

## Tuning Algorithm

```
1. Start with: min=2, max=10
2. Load test → Check waitingCount
3. If waitingCount > 0: increase max
4. If idleCount == max: decrease max
5. Adjust min based on baseline load
```

## Common Issues

### Connection Exhaustion

```javascript
// BAD: Creating pool per request
app.get('/handler', async (req, res) => {
  const pool = new Pool();  // DON'T DO THIS
  const result = await pool.query(...);
});

// GOOD: Single shared pool
const pool = new Pool();
app.get('/handler', async (req, res) => {
  const result = await pool.query(...);
});
```

### Not Releasing Connections

```javascript
// BAD
const client = await pool.connect();
if (error) throw error;
client.release();  // Only on success!

// GOOD: try/finally
const client = await pool.connect();
try {
  // work
} finally {
  client.release();
}
```

## Environment-Based Configuration

```javascript
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  min: isProduction ? 5 : 1,
  max: isProduction ? 50 : 10,
  idleTimeoutMillis: isProduction ? 30000 : 10000,
});
```

## Best Practices

1. **One pool per database endpoint** (not per request)
2. **Set reasonable timeouts** to detect hanging connections
3. **Monitor pool metrics** in production
4. **Handle pool exhaustion gracefully** with queue limits
5. **Test under realistic load** to find optimal size
