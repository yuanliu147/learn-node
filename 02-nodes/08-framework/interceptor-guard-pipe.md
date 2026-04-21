# Interceptors, Guards, and Pipes in NestJS

## Overview

These three building blocks form the request processing pipeline in NestJS, each serving a distinct purpose at different stages of the request lifecycle.

## Pipes

### Purpose
Pipes operate **before** the route handler. They transform input data (parsing, validation) or perform validation checks.

### Built-in Pipes
```typescript
import { Body, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';

@Get(':id')
findById(
  @Param('id', ParseIntPipe) id: number,  // String → Integer
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number
) {}
```

### Custom Pipe Pattern
```typescript
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  transform(value: any, { metatype, type }: ArgumentMetadata) {
    // type: 'body' | 'query' | 'param' | 'custom'
    // metatype: The TypeScript type of the parameter
    
    if (type === 'param' && metatype === Number) {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new BadRequestException('Invalid ID format');
      }
      return parsed;
    }
    
    return value;
  }
}
```

### Class Validator Integration
```typescript
// DTO with validation decorators
import { IsString, IsEmail, IsInt, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsInt()
  @Min(0)
  age: number;
}

// Pipe setup with ValidationPipe
app.useGlobalPipes(new ValidationPipe({ 
  whitelist: true,        // Strip non-decorated properties
  forbidNonWhitelisted: true,  // Reject extra fields
  transform: true,        // Transform plain objects to class instances
  transformOptions: { enableImplicitConversion: true }
}));
```

## Guards

### Purpose
Guards operate **before** the route handler (like Pipes) but their purpose is **authorization** - determining whether a request should proceed.

### Basic Guard
```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];
    
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }
    
    const user = this.authService.verify(token);
    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }
    
    request.user = user;  // Attach user for later use
    return true;
  }
}

// Usage
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {}
```

### Role-based Guard
```typescript
// Set metadata with roles
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

// Guard checking roles
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!requiredRoles) return true;
    
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some(role => user.roles.includes(role));
  }
}

// Usage
@Get(':id')
@Roles('admin', 'moderator')
getUser(@Param('id') id: string) {}
```

## Interceptors

### Purpose
Interceptors wrap the route handler, enabling:
- Response transformation (wrap responses)
- Logging/timing
- Caching
- Extending behavior before/after method execution

### Basic Interceptor
```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Before handler executes
    const request = context.switchToHttp().getRequest();
    console.log('Before handler:', request.url);
    
    return next.handle().pipe(
      map(data => {
        // After handler executes
        return {
          success: true,
          data,
          timestamp: new Date().toISOString()
        };
      })
    );
  }
}

// Usage
@Controller('users')
@UseInterceptors(TransformInterceptor)
export class UsersController {}
```

### Logging Interceptor with Timing
```typescript
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const duration = Date.now() - startTime;
        this.logger.log(`${method} ${url} ${response.statusCode} - ${duration}ms`);
      }),
      catchError(err => {
        const duration = Date.now() - startTime;
        this.logger.error(`${method} ${url} ${duration}ms - ${err.message}`);
        throw err;
      })
    );
  }
}
```

### Cache Interceptor
```typescript
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(private cacheManager: CacheManager) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const key = request.url;
    
    const cached = await this.cacheManager.get(key);
    if (cached) {
      return of(cached);
    }
    
    return next.handle().pipe(
      tap(response => this.cacheManager.set(key, response, { ttl: 60000 }))
    );
  }
}
```

## Request Lifecycle Summary

```
Request → Guard 1 → Guard 2 → Pipe 1 → Pipe 2 → Interceptor (pre) → Handler → Interceptor (post) → Response
```

1. **Guards** - Authentication, authorization
2. **Pipes** - Data transformation, validation
3. **Interceptors (pre-handler)** - Code before handler
4. **Handler** - Route handler executes
5. **Interceptors (post-handler)** - Transform response
6. **Exception Filters** - Handle errors (if thrown)

## Decorator Execution Order

```typescript
// NestJS applies these bottom-to-top:
// @UseGuards(GuardA, GuardB)    ← executes second
// @UsePipes(PipeA, PipeB)       ← executes first
// @UseInterceptors(Interceptor) ← wraps everything
@Controller('users')
export class UsersController {}
```

## Comparison Table

| Feature | Guard | Pipe | Interceptor |
|---------|-------|------|-------------|
| **Purpose** | Authorization | Data transformation/validation | Cross-cutting concerns |
| **Execution** | Before handler | Before handler | Before & after handler |
| **Can modify args** | No | Yes (transform) | Yes (pre only) |
| **Can modify response** | No | No | Yes |
| **Has body** | No | Returns transformed value | Observable stream |
| **Use case** | Auth, roles, permissions | Parse IDs, validate DTOs | Logging, caching, wrapping |

## Global Application-wide

```typescript
// main.ts
app.useGlobalGuards(new AuthGuard(app));
app.useGlobalPipes(new ValidationPipe({ transform: true }));
app.useGlobalInterceptors(new LoggingInterceptor());

// Or in module
@Module({
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_PIPE, useClass: ValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ]
})
export class AppModule {}
```
