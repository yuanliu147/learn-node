# Express Middleware Chain

## Concept & Overview

Express middleware functions are functions that have access to the request object (`req`), response object (`res`), and the next middleware function in the application's request-response cycle. Middleware can execute code, make changes to the request/response objects, end the request-response cycle, or call the next middleware.

## Execution Flow

```
Request → Middleware 1 → Middleware 2 → Middleware 3 → Route Handler → Response
              ↓               ↓              ↓
           next()          next()         next()
```

## Middleware Types

### 1. Built-in Middleware
```javascript
express.json()      // Parse JSON bodies
express.urlencoded() // Parse URL-encoded bodies
express.static()     // Serve static files
express.router()     // Create modular route handlers
```

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

### 3. Router-level Middleware
```javascript
const apiRouter = express.Router();

apiRouter.use(authMiddleware);  // Applied to all /api/* routes
apiRouter.get('/users', handler);
apiRouter.post('/users', handler);
```

### 4. Error-handling Middleware
```javascript
// Must have 4 parameters: err, req, res, next
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});
```

### 5. Third-party Middleware
```javascript
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
```

## Creating Custom Middleware

### Basic Middleware
```javascript
function logger(req, res, next) {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next(); // Must call next() or request will hang
}
```

### Middleware with Options
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

## Common Patterns

### Request Processing Pipeline
```javascript
app.use(express.json());                    // 1. Parse body
app.use(authenticate);                      // 2. Authenticate
app.use(rateLimit);                         // 3. Rate limit
app.use('/api', apiRouter);                 // 4. Route
app.use(notFoundHandler);                   // 5. 404 handler
app.use(errorHandler);                      // 6. Error handler
```

### Middleware Precedence
- Middleware defined first executes first
- Use `app.use()` for global middleware (order matters)
- Use `app.METHOD()` for specific routes (executes after global)

## Key Takeaways

| Aspect | Detail |
|--------|--------|
| **next()** | Must be called unless response is ended |
| **Order** | Middleware order is critical - sequential execution |
| **Error handling** | Must have 4 parameters, catches errors from previous middleware |
| **Async** | Wrap async handlers to catch errors in error middleware |
| **Scope** | `app.use()` = global, route-level = scoped |

## Common Mistakes

1. **Forgetting to call `next()`** - Request hangs
2. **Not handling async errors** - Use try/catch or async wrapper
3. **Incorrect middleware order** - Logging after route = won't log 404s
4. **Error middleware at wrong position** - Must be last
