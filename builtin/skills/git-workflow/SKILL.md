---
name: git-workflow
description: 执行规范、安全的 Git 分支与提交工作流
triggers: [git commit, git workflow, 提交代码, 分支管理]
tools_required: [git_status]
---
# Git 规范化工作流与提交准则 (Git Workflow)

## 概述
本技能定义清晰、专业的 Git 操作流程，涵盖语义化提交（Conventional Commits）、分支管理、安全回滚与清晰的提交总结。

---

## 语义化提交格式 (Conventional Commits)

每次提交应遵循标准的格式：
`<type>(<scope>): <subject>`

### 常用 Type 类型
- `feat`: 新增功能
- `fix`: 修复缺陷或 Bug
- `refactor`: 代码重构（不改变外部行为）
- `perf`: 性能优化
- `test`: 增加或修改测试用例
- `docs`: 文档变更
- `chore`: 构建系统、依赖更新或辅助工具变动
- `style`: 样式/格式调整（不影响代码逻辑）

---

## 提交与操作准则

1. **原子化提交 (Atomic Commits)**：
   - 每次提交只做一件明确的事情，避免将无关的功能和格式修改混在一起。
2. **提交前安全检查**：
   - 必须运行 `git status` 检查暂存区。
   - 严禁将 `.env`、密钥文件、临时日志、编译产生的构建产物提交入库。
3. **编写清晰的提交说明**：
   - 首行简明扼要（不超过 50-72 字符）。
   - 如有复杂变更，在第二行留空，第三行起说明变更动机与关键影响。
