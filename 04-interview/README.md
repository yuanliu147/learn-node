# 面试体系 (Interview System)

> 面试备战资料，涵盖知识点、代码手写、系统设计

## 总览

| 类型 | 文件 | 说明 |
|------|------|------|
| 主题题库 | [topic-questions.md](topic-questions.md) | 按主题分类的面试题 |
| 手写代码 | [coding-handwriting.md](coding-handwriting.md) | 常考手写代码清单 |
| 系统设计 | [system-design/](system-design/) | 系统设计题 |
| 经历模板 | [experience-stories.md](experience-stories.md) | STAR 项目经历模板 |

---

## 面试高频 TOP 10

| 排名 | 知识点 | 出现频率 |
|------|--------|----------|
| 1 | 事件循环 Phase | 🔥🔥🔥 |
| 2 | 微任务与宏任务 | 🔥🔥🔥 |
| 3 | Promise 内部原理 | 🔥🔥🔥 |
| 4 | CommonJS vs ESM | 🔥🔥 |
| 5 | async/await 原理 | 🔥🔥 |
| 6 | EventEmitter | 🔥🔥 |
| 7 | setTimeout vs nextTick | 🔥🔥 |
| 8 | Process vs Worker | 🔥🔥 |
| 9 | Stream 背压 | 🔥🔥 |
| 10 | HTTP 生命周期 | 🔥🔥 |

---

## 使用建议

### 面试前 1 周

1. **Day 1-2**: 复习 TOP 10 高频知识点
2. **Day 3-4**: 练习手写代码清单
3. **Day 5**: 看系统设计题思路
4. **Day 6-7**: 模拟面试，练习表述

### 面试前 1 天

1. 过一遍所有 🔥🔥🔥 知识点
2. 确保手写代码清单中的题目都能手写出来
3. 准备 2-3 个项目经历（用 STAR 法则）

---

## 手写代码清单

详见 [coding-handwriting.md](coding-handwriting.md)

包含 12 道常考题目：
- EventEmitter 实现
- 防抖/节流
- Promise 实现
- LRU 缓存
- 深拷贝
- 请求去重
- Stream pipeline
- 任务调度器
- 异步并发池
- 记忆化
- 重试机制
- ...

---

## 系统设计题

### AI 知识库

设计一个 AI 知识库系统，支持：
- 文档上传和解析
- 向量 embedding
- 相似度检索
- RAG 问答

→ [查看详情](system-design/ai-knowledge-base.md)

---

## 面试技巧

### 1. 知识点表述模板

```
1. 这是什么（简单定义）
2. 原理是什么（核心机制）
3. 代码怎么用（示例）
4. 注意事项（常见误区）
```

### 2. 手写代码技巧

```
1. 先沟通确认需求
2. 写注释说明思路
3. 先实现核心逻辑
4. 考虑边界情况
5. 主动分析复杂度
```

### 3. 系统设计技巧

```
1. 确认需求和约束
2. 提出高层架构
3. 深入核心组件
4. 讨论 trade-offs
5. 提及可扩展方向
```
