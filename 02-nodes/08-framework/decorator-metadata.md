# Decorator Metadata in Modern Node.js Frameworks

## Concept & Overview

Decorators are experimental JavaScript features (ES2017+) that enable meta-programming by allowing developers to annotate and modify classes, methods, properties, and parameters at design time. Frameworks like NestJS use decorators extensively to define routes, validation, authentication, and more.

## Decorator Types

### Class Decorators
```javascript
// Modify or enhance class behavior
@sealed
class BugReport {
  constructor(id) {
    this.id = id;
  }
}

function sealed(constructor) {
  Object.seal(constructor);
  Object.seal(constructor.prototype);
}
```

### Method Decorators
```javascript
// Modify method behavior
class Calculator {
  @logger
  add(a, b) {
    return a + b;
  }
}

function logger(target, name, descriptor) {
  const original = descriptor.value;
  descriptor.value = function(...args) {
    console.log(`Calling ${name} with`, args);
    return original.apply(this, args);
  };
  return descriptor;
}
```

### Property Decorators
```javascript
// Access or modify property metadata
class User {
  @format("YYYY-MM-DD")
  birthday;
}

function format(formatString) {
  return function(target, key) {
    Object.defineProperty(target, key, {
      get: () => formatDate(this._birthday, formatString),
      set: (val) => this._birthday = val
    });
  };
}
```

### Parameter Decorators
```javascript
// Validate/transform parameters
function required(target, methodName, paramIndex) {
  // Mark parameter as required
}

class Greeter {
  greet(@required name) {
    return `Hello, ${name}`;
  }
}
```

## Reflect Metadata

### Setup
```bash
npm install reflect-metadata
```
```javascript
import 'reflect-metadata';

const metadataKey = 'design:type';
Reflect.defineMetadata(metadataKey, String, UserClass, 'propertyName');
const type = Reflect.getMetadata(metadataKey, UserClass, 'propertyName');
```

### Design-time Type Metadata
```javascript
// Automatically captured for typed parameters
class UserService {
  getUser(@MinLength(3) id: string) {}
}

// Reflect.getMetadata('design:type', target, 'id') === String
// Reflect.getMetadata('design:paramtypes', target, 'getUser') === [String]
```

### Custom Metadata
```javascript
// Common keys (by convention)
'definition:paramtypes'  // Constructor parameter types
'design:returntype'      // Method return type
'validation:rules'       // Custom validation metadata
```

## NestJS Decorator Patterns

### Route Decorators
```typescript
@Get(':id')                    // HTTP method
@Post()                        // POST request
@Put(':id')                    // PUT request
@Delete(':id')                 // DELETE request
@Patch(':id')                  // PATCH request
@All('/path')                  // All HTTP methods
@Head() @Options()             // Other methods
```

### Parameter Decorators
```typescript
@Controller('users')
class UserController {
  @Get(':id')
  findOne(
    @Param('id') id: string,           // URL parameter
    @Query('sort') sort: string,       // Query string
    @Body() user: CreateUserDto,       // Request body
    @Headers('authorization') auth: string, // HTTP header
    @Req() req: Request,               // Full request object
    @Res() res: Response,              // Full response object
  ) {}
}
```

### Custom Decorator Pattern
```typescript
// Factory function returning decorator
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

// Usage: @CurrentUser() user: User
```

### Composite Decorators
```typescript
// Combine multiple decorators
function Authenticated(role: UserRole) {
  return applyDecorators(
    UseGuards(AuthGuard),
    SetMetadata('roles', [role]),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}

@Authenticated(UserRole.ADMIN)
@Post(':id/activate')
activate(@Param('id') id: string) {}
```

## Metadata Storage

### At Class Level
```typescript
// Store class-level metadata
Reflect.defineMetadata('controller:path', '/users', UserController);
Reflect.defineMetadata('controller:scope', 'REQUEST', UserController);
```

### At Method Level
```typescript
// Store route metadata
Reflect.defineMetadata('route:method', 'GET', UserController.prototype, 'findAll');
Reflect.defineMetadata('route:path', '/users', UserController.prototype, 'findAll');
```

### At Property Level
```typescript
// Store field metadata
Reflect.defineMetadata('field:validation', { type: 'string', minLength: 1 }, UserEntity, 'name');
```

## Practical Applications

### Building a Simple Router
```javascript
const routes = [];

function Controller(basePath) {
  return function(target) {
    Reflect.defineMetadata('basePath', basePath, target);
    // Scan prototype for @Get, @Post etc.
    Object.getOwnPropertyNames(target.prototype)
      .filter(name => name !== 'constructor')
      .forEach(name => {
        const method = target.prototype[name];
        const route = Reflect.getMetadata('route', method);
        if (route) {
          routes.push({
            method: route.method,
            path: basePath + route.path,
            handler: method
          });
        }
      });
  };
}

function Get(path) {
  return function(target, name, descriptor) {
    Reflect.defineMetadata('route', { method: 'GET', path }, descriptor.value);
    return descriptor;
  };
}

@Controller('/users')
class UserController {
  @Get('/')
  findAll() { return []; }
}
```

## Key Takeaways

| Decorator | Target | NestJS Example |
|-----------|--------|----------------|
| `@Controller()` | Class | Defines route base path |
| `@Get()`, `@Post()` etc. | Method | Defines HTTP verb + path |
| `@Param()`, `@Body()` | Parameter | Extract request parts |
| `@Inject()` | Constructor param | DI token reference |
| `@UseGuards()` | Method/Class | Security middleware |
| `@SetMetadata()` | Method/Class | Custom key-value data |

## Experimental Status

```javascript
// Current TC39 proposal: Stage 3
// Enable in tsconfig.json:
{
  "experimentalDecorators": true,     // TypeScript
  "emitDecoratorMetadata": true,       // Required for DI containers
  // OR in package.json (vanilla JS):
  "experimentalDecorators": true
}
```

## Metadata Reflection Utilities

```javascript
// Common reflection patterns
Reflect.getMetadata('design:paramtypes', target);     // Constructor deps
Reflect.getMetadata('design:returntype', target, key); // Return type
Reflect.hasMetadata('custom:key', target, key);       // Check existence
Reflect.getMetadataKeys(target);                      // All keys
Reflect.deleteMetadata('key', target, key);          // Remove
```
