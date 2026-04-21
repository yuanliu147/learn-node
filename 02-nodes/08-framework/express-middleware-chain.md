# Express Middleware Chain

## Architectural Perspective

Express middleware embodies the **Pipeline Pattern** - a foundational software architecture pattern where data flows through a sequence of processing stages. Understanding why Express chose this model over alternatives reveals key trade-offs in web framework design.

**Design Decision**: Express adopted middleware as its core extension mechanism rather than filters (Rails), filters (ASP.NET), or decorators (Python). This choice prioritized:
- Composability over feature richness
- Explicit control flow over convention
- Minimal core with maximum flexibility

## Execution Flow

```
Request → Middleware 1 → Middleware 2 → Middleware 3 → Route Handler → Response
              ↓               ↓              ↓
           next()          next()         next()

Error Path: Request → ... → Error → Error MW → Response
                           ↓ (err, req, res, next)
```

**Critical Insight**: The middleware chain is synchronous by default. Async operations must explicitly propagate via callbacks or promises. This is a fundamental design constraint that affects error handling and request lifecycle management.

## Middleware Types

### 1. Built-in Middleware
```javascript
express.json()      // Parse JSON bodies
express.urlencoded() // Parse URL-encoded bodies
express.static()     // Serve static files
express.router()     // Create modular route handlers
```

**Architecture Note**: These are framework-provided processing stages. `express.json()` uses Node's built-in JSON parsing with size limits - a security consideration baked into the framework.

### 2. Application-level Middleware
```javascript
// Global middleware - runs on every request
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Route-specific middleware
app.get('/api', middleware, (req, res) => res.json({}));
```

**Trade-off**: Global middleware applies uniformly but adds overhead to every request. Route-specific middleware optimizes per-route but requires explicit declaration.

### 3. Router-level Middleware
```javascript
const apiRouter = express.Router();

apiRouter.use(authMiddleware);  // Applied to all /api/* routes
apiRouter.get('/users', handler);
apiRouter.post('/users', handler);
```

**Architectural Value**: Routers enable **modular monolith** architecture - logical separation within a single process. This scales to microservices by extracting routers to separate services without code changes.

### 4. Error-handling Middleware
```javascript
// Must have 4 parameters: err, req, res, next
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});
```

**Design Rationale**: Error middleware is structurally distinct from regular middleware (4 params vs 3). This separation:
- Prevents error handlers from accidentally being called as normal middleware
- Makes error flow explicit in the code
- Enables centralized error transformation

## Creating Custom Middleware

### Basic Middleware
```javascript
function logger(req, res, next) {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next(); // Must call next() or request will hang
}
```

**Lifecycle Rule**: Every middleware must either call `next()`, send a response (`res.send`, `res.json`, `res.end`), or throw. Failure to do any causes **request hangs** - a common production issue.

### Middleware with Options (Factory Pattern)
```javascript
function validateBody(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    next();
  };
}

// Usage
app.post('/users', validateBody(userSchema), userController.create);
```

**Pattern**: Higher-order function returning middleware. This enables **configuration-driven middleware** - the same validator can have different schemas without code duplication.

### Async Middleware
```javascript
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
}));
```

**Why This Exists**: Express's error handling is callback-based. Async functions return Promises - without wrapping, thrown errors never reach error middleware. This adapter pattern bridges synchronous and asynchronous paradigms.

## Common Patterns

### Request Processing Pipeline
```javascript
app.use(express.json());                    // 1. Parse body (transform)
app.use(authenticate);                      // 2. Authenticate (gate)
app.use(rateLimit);                         // 3. Rate limit (protect)
app.use('/api', apiRouter);                 // 4. Route (dispatch)
app.use(notFoundHandler);                   // 5. 404 handler (final)
app.use(errorHandler);                      // 6. Error handler (catch)
```

**Layered Architecture**: This follows traditional layered architecture principles:
- Infrastructure (parsing, logging)
- Security (auth, rate limiting)
- Business logic (routing, handlers)
- Cross-cutting (errors, 404s)

### Middleware Precedence
- Middleware defined first executes first
- Use `app.use()` for global middleware (order matters critically)
- Use `app.METHOD()` for specific routes (executes after global)

**Non-intuitive Aspect**: Unlike most frameworks where declaration order matters less, Express has strict sequential execution. This makes mental modeling easier but errors subtler.

## Performance Considerations

| Aspect | Impact | Mitigation |
|--------|--------|------------|
| Middleware overhead | Each `use()` adds ~0.1ms | Remove unused middleware |
| Synchronous chain | Blocks event loop | Keep handlers async |
| Body parsing | Memory allocation | Set `limit` option |
| Logging | I/O bottleneck | Use streaming loggers |

**Scalability Insight**: Express is single-threaded by default. Middleware processing is synchronous - long operations block all concurrent requests. For CPU-intensive work, consider:
- Worker threads (`cluster` module)
- Offloading to external services
- Switching to Worker Threads or Deno

## Comparison with Alternatives

| Framework | Extension Model | Trade-off |
|-----------|----------------|-----------|
| Express | Middleware pipeline | Simple, explicit, but callback-heavy |
| Koa | Async middleware (ctx) | Cleaner async, but less ecosystem |
| Fastify | Plugin system | Better performance, but younger |
| Hapi | Plugin + handlers | Structured, but more opinionated |

**Why Express Dominates**: Despite being older and slower than alternatives, Express's middleware model is intuitive, widely understood, and has massive ecosystem support. The callback-based model is verbose but predictable.

## Key Architectural Takeaways

| Aspect | Detail |
|--------|--------|
| **Pattern** | Pipeline (chain of responsibility) |
| **Control Flow** | Explicit sequential, synchronous default |
| **Error Model** | Separate error middleware with 4 params |
| **Composition** | Higher-order functions for configurable middleware |
| **Scalability** | Single-threaded; use `cluster` for multi-core |

## Common Mistakes

1. **Forgetting to call `next()`** - Request hangs indefinitely
   - **Why it happens**: Express doesn't timeout hanging requests by default
   
2. **Not handling async errors** - Errors silently disappear
   - **Solution**: Use `asyncHandler` wrapper or `try/catch` in every handler

3. **Incorrect middleware order** - Security/logging bypassed
   - **Example**: Logging after route = 404s won't be logged

4. **Error middleware at wrong position** - Errors not caught
   - **Rule**: Error handlers MUST be last, after all routes

5. **Modifying `req`/`res` after sending** - Silent failures
   - **Example**: `res.json()` called, then `res.status(404)` - status change ignored

## Production Checklist

- [ ] All handlers wrapped with async error handling
- [ ] Body parsers have `limit` option set
- [ ] Rate limiting middleware in place
- [ ] Error middleware logs full stack traces
- [ ] Request timeout middleware configured
- [ ] gzip compression enabled
- [ ] Security headers via `helmet`
