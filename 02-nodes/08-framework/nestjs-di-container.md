# NestJS Dependency Injection Container

## Concept & Overview

NestJS uses a dependency injection (DI) container to manage class instantiation and dependency resolution. The framework automatically resolves dependencies by analyzing constructor parameters at bootstrap time, eliminating manual service lookup and wiring.

## Core Principles

1. **Inversion of Control (IoC)** - Framework controls object creation
2. **Dependency Injection** - Dependencies "injected" rather than created
3. **InversifyJS** - Underlying IoC container (metadata-based)

## Basic Injection

### Service Definition
```typescript
// cats.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  create(cat: CreateCatDto): Cat {
    this.cats.push(cat);
    return cat;
  }

  findAll(): Cat[] {
    return this.cats;
  }
}
```

### Controller with Injection
```typescript
// cats.controller.ts
import { Controller, Get, Post, Body } from '@nestjs/common';
import { CatsService } from './cats.service';

@Controller('cats')
export class CatsController {
  // NestJS instantiates CatsService and injects it
  constructor(private readonly catsService: CatsService) {}

  @Get()
  findAll(): Cat[] {
    return this.catsService.findAll();
  }

  @Post()
  create(@Body() createCatDto: CreateCatDto): Cat {
    return this.catsService.create(createCatDto);
  }
}
```

## Dependency Tokens

### Class-based Tokens (Default)
```typescript
// Auto-resolved by class reference
constructor(private service: CatsService) {}
```

### String-based Tokens
```typescript
// Using @Inject() with string token
constructor(@Inject('CONFIG') private config: ConfigService) {}

// Manual provider
{ provide: 'CONFIG', useClass: ConfigService }
```

### Factory Providers
```typescript
{
  provide: 'DB_CONNECTION',
  useFactory: async (config: ConfigService) => {
    const db = await createConnection(config);
    return db;
  },
  inject: [ConfigService]  // Dependencies for factory
}
```

## Provider Types

### useClass
```typescript
// Instantiate given class
{ provide: CacheService, useClass: RedisCacheService }
```

### useValue
```typescript
// Inject existing instance/value
{ provide: 'API_KEY', useValue: process.env.API_KEY }
{ provide: 'MOCK_DB', useValue: mockDatabaseInstance }
```

### useFactory
```typescript
// Create instance dynamically
{
  provide: 'ASYNC_SERVICE',
  useFactory: async (db: DatabaseService) => {
    return await AsyncService.create(db);
  },
  inject: [DatabaseService]
}
```

### useExisting
```typescript
// Alias existing provider
{ provide: 'ALIASED_SERVICE', useExisting: CatsService }
```

## Module-level DI

### Feature Module
```typescript
// cats.module.ts
@Module({
  providers: [CatsService],  // Provided in this module
  controllers: [CatsController],
  exports: [CatsService]      // Available to other modules
})
export class CatsModule {}
```

### Sharing Services
```typescript
// shared.module.ts
@Module({
  providers: [CommonService],
  exports: [CommonService]
})
export class SharedModule {}

// In another module:
@Module({
  imports: [SharedModule],  // Reuse providers
  providers: [BusinessService],
  controllers: [BusinessController]
})
export class BusinessModule {}
```

## Scopes

### Default (Singleton)
```typescript
@Injectable() // Default: scope: Scope.DEFAULT
export class CatsService {}
// Single instance shared across entire application
```

### Request-scoped
```typescript
@Injectable({ scope: Scope.REQUEST })
export class RequestLogger {
  constructor(private readonly request: Request) {}
  // New instance created per HTTP request
}
```

### Transient
```typescript
@Injectable({ scope: Scope.TRANSIENT })
export class PayloadService {}
// New instance every time it's injected somewhere
```

## Custom Decorators with DI

```typescript
// user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user; // Resolved from authenticated request
  },
);
```

## Lifecycle Hooks

```typescript
@Injectable()
export class AppService implements OnInit, OnModuleInit, OnModuleDestroy {
  onModuleInit() { /* Called once when module initializes */ }
  onModuleDestroy() { /* Cleanup before shutdown */ }
}
```

## Key Takeaways

| Concept | Usage |
|---------|-------|
| **@Injectable()** | Marks class as provider |
| **constructor** | Primary DI mechanism |
| **providers[]** | Module-level service definitions |
| **exports[]** | Make providers available to other modules |
| **imports[]** | Reuse providers from other modules |

## Common Patterns

### Circular Dependencies
```typescript
// Use forwardRef()
constructor(
  @Inject(forwardRef(() => ServiceA))
  private serviceA: ServiceA,
) {}
```

### Optional Dependencies
```typescript
constructor(
  @Optional() @Inject('CONFIG') private config?: ConfigService
) {}
```

### Property-based Injection (Not Recommended)
```typescript
@Inject('CONFIG') config: ConfigService;  // Instead of constructor
```
