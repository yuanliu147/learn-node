---
phase: 03
name: 框架与工程化
duration: 2-3 周
prerequisites: ["phase-02-async-stream"]
next_phase: phase-04-ai-backend
version: 1.0
last_updated: 2026-04-21
---

# Phase 03: 框架与工程化

## 学习目标

完成本阶段后，你应该能够：
- [ ] 深入理解 Express 中间件链的工作原理
- [ ] 掌握 NestJS 的依赖注入容器原理
- [ ] 理解装饰器在 TypeScript/NestJS 中的应用
- [ ] 能够构建一个生产级别的 RESTful API
- [ ] 掌握 API 认证、授权、验证的最佳实践
- [ ] 理解日志、监控、错误追踪的工程化实践

## 知识点清单

| # | 知识点 | 难度 | 节点文件 | 预计时间 |
|---|--------|------|----------|----------|
| 1 | Express 中间件链 | L3 | [express-middleware-chain](../02-nodes/08-framework/express-middleware-chain.md) | 3h |
| 2 | NestJS DI 容器 | L4 | [nestjs-di-container](../02-nodes/08-framework/nestjs-di-container.md) | 4h |
| 3 | 装饰器与元数据 | L4 | [decorator-metadata](../02-nodes/08-framework/decorator-metadata.md) | 3h |
| 4 | 拦截器/守卫/管道 | L4 | [interceptor-guard-pipe](../02-nodes/08-framework/interceptor-guard-pipe.md) | 3h |

## 实践任务

- [ ] **项目 P1**: 使用 Express 构建一个 RESTful API，包含 CRUD、中间件、错误处理
- [ ] **项目 P2**: 使用 NestJS 重构上述 API，使用依赖注入、装饰器、守卫
- [ ] **项目 P3**: 为 API 添加 JWT 认证、日志、Swagger 文档

## 验收标准

1. 能够解释 Express 中间件 next() 和 return next() 的区别
2. 能够手写一个简单的依赖注入容器
3. 能够实现一个自定义装饰器
4. 能够描述 NestJS 请求生命周期
5. 通过本阶段的模拟面试

## 继续学习

完成 Phase 3 后，你可以进入 [Phase 4: AI 后端专项](phase-04-ai-backend.md)

---

*版本: 1.0 | 最后更新: 2026-04-21*
