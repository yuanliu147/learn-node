---
phase: 00
name: 前置基础
duration: 1 周
difficulty: L1
version: 1.0
last_updated: 2026-04-21
---

# Phase 0: 前置基础

## 学习目标

完成本阶段后，你应该能够：
- [ ] 熟练使用 ES6+ 的核心语法（let/const、箭头函数、解构、async/await）
- [ ] 熟练使用 Git 进行版本控制
- [ ] 熟练使用命令行（Linux 基础命令）
- [ ] 了解 HTTP 协议基础

## 前置要求检查

在开始学习 Node.js 之前，请确保你已经掌握以下内容：

### JavaScript ES6+ 基础

| 知识点 | 要求 | 自检 |
|--------|------|------|
| 变量声明 | 理解 let/const 与 var 的区别 | 能解释暂时性死区 |
| 箭头函数 | 掌握箭头函数与普通函数的区别 | 能解释 this 绑定 |
| 解构赋值 | 掌握对象和数组解构 | 能实现嵌套解构 |
| Promise | 理解 Promise 的三种状态 | 能使用 Promise.all |
| async/await | 理解异步编程概念 | 能读写 async 函数 |
| 模块导入导出 | 理解 import/export 语法 | 能实现模块化 |

### Linux 基础

| 知识点 | 要求 | 自检 |
|--------|------|------|
| 文件系统 | 理解 Linux 目录结构 | 能使用 ls/cd/mkdir/rm |
| 权限 | 理解 rwx 权限模型 | 能修改文件权限 |
| 管道 | 理解管道和重定向 | 能组合使用命令 |
| 环境变量 | 理解 PATH | 能设置和读取环境变量 |
| 进程 | 理解前台/后台进程 | 能管理进程 |

### Git 基础

| 知识点 | 要求 | 自检 |
|--------|------|------|
| 基础操作 | add/commit/push/pull | 能完成日常提交流程 |
| 分支 | 理解分支概念 | 能创建和合并分支 |
| 暂存 | 理解暂存区 | 能使用 stash |

### HTTP 基础

| 知识点 | 要求 | 自检 |
|--------|------|------|
| 请求方法 | GET/POST/PUT/DELETE | 理解 RESTful 概念 |
| 状态码 | 2xx/3xx/4xx/5xx | 能解释常见状态码含义 |
| Header | 理解常见 Header | 能设置和读取 Header |

## 学习资源

### JavaScript

- [MDN JavaScript 教程](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)
- [ES6 入门教程](https://es6.ruanyifeng.com/)

### Linux

- [Linux 命令行基础](https://missing.csail.mit.edu/)
- [鸟哥的 Linux 私房菜](http://linux.vbird.org/)

### Git

- [Git 官方文档](https://git-scm.com/book/zh/v2)
- [Git 飞行手册](https://github.com/phodal/github)

## 验收标准

完成以下任务作为验收：

1. **JavaScript 测验**: 完成 ES6+ 测验，获得 80% 以上分数
2. **Git 实战**: 在 GitHub 上创建一个仓库，使用 Git 提交至少 5 次
3. **Linux 实战**: 在 Linux 环境下完成一次完整的项目部署流程

## 常见问题

### Q: 我已经有其他语言的基础，需要多快完成这个阶段？

A: 如果你已经熟悉编程，这个阶段可以压缩到 2-3 天。但请确保不要跳过，因为很多 Node.js 的问题根因都在于对 JS 基础理解不深。

### Q: 我之前只用过 Python，需要专门学习 Linux 吗？

A: Node.js 开发通常在 Linux 环境下进行。建议至少熟悉常用命令。如果使用 Windows，可以用 WSL2 作为过渡。

## 继续学习

完成 Phase 0 后，你可以进入 [Phase 1: 原生 Node.js 基础](phase-01-native-node.md)

---

*版本: 1.0 | 最后更新: 2026-04-21*
