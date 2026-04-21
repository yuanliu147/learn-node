# Node.js 系统性知识库

> 基于 AI 驱动学习路线生成系统设计，构建结构化、可迭代、深度与广度兼备的 Node.js 学习资料集合

---

## 📖 快速导航

| 层级 | 内容 | 入口 |
|------|------|------|
| **Layer 1** | 学习路线 | [01-roadmap/](01-roadmap/README.md) |
| **Layer 2** | 知识节点 | [02-nodes/](02-nodes/README.md) |
| **Layer 3** | 资源索引 | [05-resources/](05-resources/README.md) |
| **实践** | 动手项目 | [03-practices/](03-practices/README.md) |
| **面试** | 面试备战 | [04-interview/](04-interview/README.md) |

---

## 🗺️ 学习路线总览

```
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js 学习路线图                            │
├─────────────────────────────────────────────────────────────────┤
│  Phase 0 │ 前置基础 ────────────── JS ES6+ / Linux / Git      │
│           └────────────────────────────────────────────────────►│
│  Phase 1 │ 原生 Node.js 基础 ─────── 模块 / 事件循环 / Buffer  │
│           └────────────────────────────────────────────────────►│
│  Phase 2 │ 异步与流 ─────────────── Promise / Stream / 管道    │
│           └────────────────────────────────────────────────────►│
│  Phase 3 │ 框架与工程化 ─────────── Express / NestJS / 部署    │
│           └────────────────────────────────────────────────────►│
│  Phase 4 │ AI 后端专项 ───────────── SSE / LLM / RAG / 向量    │
│           └────────────────────────────────────────────────────►│
│  Phase 5 │ 性能优化 ─────────────── 内存 / V8 / profile / GC   │
│           └────────────────────────────────────────────────────►│
│  Phase 6 │ 进阶与源码 ───────────── N-API / Cluster / 源码阅读 │
│           └────────────────────────────────────────────────────►│
└─────────────────────────────────────────────────────────────────┘
```

| 阶段 | 名称 | 预计时间 | 难度 |
|------|------|----------|------|
| [Phase 0](01-roadmap/phase-00-prerequisites.md) | 前置基础 | 1 周 | L1 |
| [Phase 1](01-roadmap/phase-01-native-node.md) | 原生 Node.js 基础 | 2-3 周 | L2-L3 |
| [Phase 2](01-roadmap/phase-02-async-stream.md) | 异步与流 | 2-3 周 | L3-L4 |
| [Phase 3](01-roadmap/phase-03-framework.md) | 框架与工程化 | 2-3 周 | L2-L3 |
| [Phase 4](01-roadmap/phase-04-ai-backend.md) | AI 后端专项 | 2-3 周 | L3-L4 |
| [Phase 5](01-roadmap/phase-05-performance.md) | 性能优化 | 2-3 周 | L4-L5 |
| [Phase 6](01-roadmap/phase-06-advanced-source.md) | 进阶与源码 | 3-4 周 | L5 |

---

## 📊 知识体系概览

| 分类 | 节点数 | 核心知识点 |
|------|--------|------------|
| 01-Foundation | 6 | 事件循环、模块系统、Buffer、进程模型 |
| 02-Async | 5 | Promise 原理、async/await 转换、EventEmitter、async_hooks |
| 03-Stream | 5 | 流类型、背压、pipeline、对象模式、错误处理 |
| 04-Network | 5 | HTTP 生命周期、TCP 连接池、Keep-Alive、TLS、WebSocket |
| 05-Memory | 6 | V8 堆结构、GC 算法（Scavenge/Mark-Sweep/GC）、内存泄漏 |
| 06-V8 | 5 | Ignition 字节码、TurboFan 优化、内联缓存、反优化 |
| 07-libuv | 5 | 事件循环 phase、Handle 类型、ThreadPool、io_uring |
| 08-Framework | 4 | Express 中间件链、NestJS DI、装饰器、拦截器/守卫/管道 |
| 09-AI-Backend | 7 | SSE 流式、LLM 适配器、RAG、并发控制、Token 限流、Prompt 注入防御、向量存储 |
| 10-Performance | 5 | Clinic.js 工作流、火焰图、连接池调优、DNS 缓存、零拷贝 |
| 11-Advanced | 5 | Node 启动流程、C++ N-API、线程安全函数、Cluster 负载均衡、IPC |

---

## 🎯 使用指南

### 推荐学习路径

1. **自检前置** → 阅读 [Phase 0](01-roadmap/phase-00-prerequisites.md) 确认基础
2. **按阶段学习** → 按顺序完成 Phase 1-6
3. **知识深挖** → 每个阶段的知识点节点都需阅读源码/官方文档
4. **动手实践** → 每个阶段完成对应的实践项目
5. **面试备战** → 完成后查阅 [04-interview/](04-interview/README.md)

### 按需查询

- 🎓 **面试高频**: 查看 [00-meta/interview-index.md](00-meta/interview-index.md)
- 🔢 **按难度选择**: 查看 [00-meta/difficulty-index.md](00-meta/difficulty-index.md)
- 🏷️ **按标签检索**: 查看 [00-meta/tag-index.md](00-meta/tag-index.md)
- 📚 **按主题深入**: 查看 [02-nodes/](02-nodes/README.md)

---

## 🔧 核心设计原则

### 三层架构

```
Layer 1: 路线层 (Roadmap)
  └─ 做什么、按什么顺序、里程碑是什么
  └─ 文件: 01-roadmap/phase-*.md

Layer 2: 知识层 (Knowledge Node)
  └─ 每个知识点的深度解析、原理、代码、面试题
  └─ 文件: 02-nodes/**/*.md

Layer 3: 资源层 (Resource Index)
  └─ 官方文档、源码位置、论文、高质量博客、视频
  └─ 文件: 05-resources/*.md
```

### 每个文件都包含 meta 区块

```yaml
---
version: 1.0
source_docs: []
ai_confidence: 4       # AI 对内容完整度的自评 (1-5)
human_verified: false
last_updated: 2026-04-21
todo:
  - 补充 Windows IOCP 的差异
  - 添加 io_uring 的对比
---
```

---

## 📁 目录结构

```
learn-node/
├── README.md                          # 本文件：总入口
│
├── 00-meta/                           # 元数据与配置
│   ├── knowledge-graph.md             # 知识图谱（所有节点的依赖关系图）
│   ├── tag-index.md                   # 标签索引（按标签查找节点）
│   ├── difficulty-index.md            # 难度索引
│   └── interview-index.md             # 面试高频索引
│
├── 01-roadmap/                        # 学习路线（Layer 1）
│   ├── README.md                      # 路线总览
│   ├── phase-00-prerequisites.md      # 前置要求
│   ├── phase-01-native-node.md        # 原生 Node.js 基础
│   ├── phase-02-async-stream.md       # 异步与流
│   ├── phase-03-framework.md          # 框架与工程化
│   ├── phase-04-ai-backend.md         # AI 后端专项
│   ├── phase-05-performance.md        # 性能优化
│   ├── phase-06-advanced-source.md    # 进阶与源码
│   └── phase-07-mastery.md            # 掌握度自检
│
├── 02-nodes/                          # 知识节点（Layer 2）
│   ├── README.md                      # 节点总览
│   ├── 01-foundation/                 # 基础原理
│   ├── 02-async/                      # 异步机制
│   ├── 03-stream/                     # 流系统
│   ├── 04-network/                    # 网络
│   ├── 05-memory/                     # 内存
│   ├── 06-v8/                         # V8 引擎
│   ├── 07-libuv/                      # libuv
│   ├── 08-framework/                  # 框架
│   ├── 09-ai-backend/                 # AI 后端
│   ├── 10-performance/                # 性能
│   └── 11-advanced/                   # 进阶
│
├── 03-practices/                      # 实践项目（可运行代码）
│   ├── README.md                      # 实践总览
│   ├── p01-semaphore/                 # P1: 并发控制信号量
│   ├── p02-transform-stream/          # P2: 自定义 Transform
│   ├── p03-llm-proxy/                 # P3: LLM 代理网关
│   ├── p04-rag-service/               # P4: RAG 服务
│   ├── p05-worker-pool/               # P5: Worker 线程池
│   └── p06-native-addon/              # P6: C++ 原生模块
│
├── 04-interview/                      # 面试体系
│   ├── README.md                      # 面试总览
│   ├── topic-questions.md             # 按主题分类的面试题
│   ├── coding-handwriting.md          # 手写代码清单
│   ├── system-design/                 # 系统设计题
│   └── experience-stories.md          # 项目经历 STAR 模板
│
└── 05-resources/                      # 资源索引（Layer 3）
    ├── README.md                      # 资源总览
    ├── official-docs.md               # 官方文档速查表
    ├── source-code-guide.md           # 源码阅读指南
    ├── papers.md                      # 论文清单
    ├── books.md                       # 书籍推荐
    ├── blog-posts.md                  # 高质量博客索引
    ├── videos-courses.md              # 视频与课程
    ├── github-repos.md                # 推荐仓库
    └── tools.md                       # 工具链清单
```

---

## 📌 状态追踪

| 类别 | 文件数 | 完成度 |
|------|--------|--------|
| 元数据 | 4 | 🔄 进行中 |
| 学习路线 | 7 | 🔄 进行中 |
| 知识节点 | ~59 | 🔄 进行中 |
| 实践项目 | 6 | 🔄 进行中 |
| 面试体系 | 4 | 🔄 进行中 |
| 资源索引 | 8 | 🔄 进行中 |

---

## 🤝 贡献指南

此知识库采用迭代式更新：

1. 每个文件底部的 `todo` 列出已知缺失内容
2. 发现错误或过时内容请更新 `version` 和 `last_updated`
3. 添加新内容时同步更新 `knowledge-graph.md` 和相关索引
4. 重要更新需设置 `human_verified: true`

---

*最后更新: 2026-04-21 | 版本: 1.0 | AI Confidence: 4/5*
