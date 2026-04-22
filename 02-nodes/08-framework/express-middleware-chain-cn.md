# Express 中间件链：架构分析

Express 的中间件链是经典的**职责链模式**实现，其中每个中间件函数要么处理请求，要么将其传递给下一个处理器。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     Express 请求流                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   客户端                                                      │
│      │                                                        │
│      │ HTTP 请求                                              │
│      ▼                                                        │
│   ┌─────────────────────────────────────────────────────┐    │
│   │ 中间件 1 (logger)                                    │    │
│   │ next() ──────────────────────────────────────────▶  │    │
│   └─────────────────────────────────────────────────────┘    │
│      │                                                        │
│      ▼                                                        │
│   ┌─────────────────────────────────────────────────────┐    │
│   │ 中间件 2 (auth)                                      │    │
│   │ next() ──────────────────────────────────────────▶  │    │
│   │ 401? ─────────────────────────▶ 响应 + 结束        │    │
│   └─────────────────────────────────────────────────────┘    │
│      │                                                        │
│      ▼                                                        │
│   ┌─────────────────────────────────────────────────────┐    │
│   │ 中间件 3 (validation)                               │    │
│   │ next() ──────────────────────────────────────────▶  │    │
│   │ 400? ─────────────────────────▶ 响应 + 结束        │    │
│   └─────────────────────────────────────────────────────┘    │
│      │                                                        │
│      ▼                                                        │
│   ┌─────────────────────────────────────────────────────┐    │
│   │ 路由处理器                                           │    │
│   │ res.json() ────────────────────────────────────▶  │    │
│   └─────────────────────────────────────────────────────┘    │
│      │                                                        │
│      ▼                                                        │
│   ┌─────────────────────────────────────────────────────┐    │
│   │ 错误处理中间件 (err, req, res, next)               │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 中间件签名

```javascript
// 标准中间件
function middleware(req, res, next) {
    // 同步逻辑
    if (something) {
        return next();  // 继续
    }
    return next(error);  // 跳过到错误处理
}

// 异步中间件（需要 try/catch）
async function asyncMiddleware(req, res, next) {
    try {
        const data = await someAsyncOperation();
        req.processed = data;
        next();
    } catch (err) {
        next(err);  // 传递到错误处理
    }
}

// 错误处理中间件（4 个参数）
function errorHandler(err, req, res, next) {
    console.error(err.stack);
    res.status(500).json({ error: err.message });
}
```

## 核心机制：app.use() 和 next()

### 路径匹配规则

```javascript
// 精确匹配（除非使用正则）
app.use('/api', ...);     // /api/* 匹配
app.use('/api', ...);     // /api 匹配
app.use(/\/api\/\d+/, ...); // 正则匹配

// 按顺序匹配
app.use('/a', handlerA);   // 先匹配这个
app.use('/a', handlerB);  // 永远到达不了（对于 /a）
```

### next() 行为

```javascript
// next() - 传递给下一个中间件
next();

// next('route') - 跳过当前路由的剩余中间件
app.get('/user/:id', 
    (req, res, next) => { next('route'); },
    (req, res, next) => { /* 永远不会执行 */ }
);

// next(err) - 跳转到错误处理中间件
next(new Error('权限被拒绝'));
```

## 应用层中间件

### 日志中间件

```javascript
function requestLogger(req, res, next) {
    const start = Date.now();
    
    // 在响应完成后记录
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log({
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration: `${duration}ms`
        });
    });
    
    next();
}

app.use(requestLogger);
```

### 时序中间件

```javascript
function timing(req, res, next) {
    // 仅测量实际工作（不包括等待）
    const hr = process.hrtime();
    
    res.on('finish', () => {
        const [s, ns] = process.hrtime(hr);
        const ms = s * 1000 + ns / 1000000;
        res.setHeader('X-Response-Time', `${ms.toFixed(2)}ms`);
    });
    
    next();
}
```

## 路由层中间件

### 认证中间件

```javascript
function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: '需要认证' });
    }
    
    try {
        const user = verifyToken(token);
        req.user = user;  // 注入到请求
        next();
    } catch (err) {
        res.status(401).json({ error: '无效的令牌' });
    }
}

app.get('/protected', authenticate, (req, res) => {
    res.json({ user: req.user });
});
```

### 验证中间件工厂

```javascript
// 中间件工厂模式
function validate(schema) {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                error: '验证失败',
                details: error.details.map(d => d.message)
            });
        }
        
        next();
    };
}

// 使用
app.post('/users', 
    validate(userSchema),
    (req, res) => { /* 处理 */ }
);
```

## 错误处理中间件

### 标准错误处理

```javascript
// 必须有 4 个参数
function errorHandler(err, req, res, next) {
    console.error('Error:', err);
    
    // 生产环境不泄露详情
    const message = process.env.NODE_ENV === 'production'
        ? '服务器错误'
        : err.message;
    
    res.status(err.status || 500).json({
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
}

app.use(errorHandler);
```

### 异步错误处理

```javascript
// Express 不自动捕获异步错误——必须显式传递
app.get('/async', async (req, res, next) => {
    try {
        const data = await fetchData();
        res.json(data);
    } catch (err) {
        next(err);  // 必须调用 next(err)
    }
});

// 或者使用包装器
function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get('/async', asyncHandler(async (req, res) => {
    const data = await fetchData();
    res.json(data);
}));
```

## 中间件组合

### 使用 express.Router

```javascript
// users.js
const router = express.Router();

router.use(authenticate);  // 所有路由的认证

router.get('/', (req, res) => { /* 列表 */ });
router.get('/:id', (req, res) => { /* 详情 */ });

module.exports = router;

// app.js
app.use('/users', require('./users'));
```

### 使用中间件组合库

```javascript
const { compose } = require('middleware');

const middlewares = [
    logger,
    authenticate,
    validate(userSchema),
    rateLimit
];

const handler = compose(middlewares)(finalHandler);
```

## 性能考虑

### 中间件顺序影响性能

```javascript
// ❌ 昂贵操作放前面
app.use(heavyDatabaseQuery);   // 每个请求都执行
app.use(simpleLogger);         // 本可以快速跳过

// ✅ 便宜检查放前面
app.use(simpleLogger);         // 快速
app.use(heavyDatabaseQuery);   // 仅在需要时执行
```

### 条件中间件

```javascript
// 仅在特定条件下应用中间件
if (process.env.NODE_ENV === 'development') {
    app.use(devLogging);
}

// 或使用函数
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        rateLimiter(req, res, next);
    } else {
        next();
    }
});
```

## 常见陷阱

### 1. 忘记调用 next()

```javascript
// ❌ 挂起请求
app.use((req, res) => {
    // 永不调用 next()
    // 请求挂起
});

// ✅ 总是调用 next() 或发送响应
app.use((req, res, next) => {
    if (res.headersSent) return next();
    // 处理...
    next();
});
```

### 2. 在错误路径中泄露信息

```javascript
// ❌ 生产环境信息泄露
app.use((err, req, res, next) => {
    res.status(500).json({
        error: err.message,
        stack: err.stack  // 泄露敏感信息！
    });
});

// ✅ 安全错误处理
app.use((err, req, res, next) => {
    res.status(500).json({
        error: process.env.NODE_ENV === 'production' 
            ? '内部服务器错误' 
            : err.message
    });
});
```

## 中间件模式

### 中间件前缀

```javascript
// 将公共路径提取为前缀
const adminRouter = express.Router();
adminRouter.use(authenticate);
adminRouter.use(authorizeAdmin);

adminRouter.get('/users', ...);
adminRouter.delete('/users/:id', ...);

app.use('/admin', adminRouter);
```

### 动态中间件加载

```javascript
// 根据运行时条件加载中间件
function loadMiddlewares() {
    const middlewares = [];
    
    if (config.cors) middlewares.push(cors());
    if (config.compression) middlewares.push(compression());
    if (config.rateLimit) middlewares.push(rateLimit(config.rateLimit));
    
    return middlewares;
}

app.use(loadMiddlewares());
```

## 总结

Express 中间件链是 Node.js web 框架中最简单但强大的模式之一：
- **顺序执行**：中间件按定义顺序执行
- **控制流**：next() 控制权传递
- **错误冒泡**：错误跳转到错误处理中间件
- **组合性**：Router 和中间件工厂实现模块化
