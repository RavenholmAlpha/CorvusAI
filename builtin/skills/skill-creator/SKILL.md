---
name: skill-creator
description: 创建具备标准元数据和触发词的 Corvus Skill
triggers: [create skill, 创建技能, skill creator]
tools_required: [write_file]
---
# 技能创建与定制规范 (Skill Creator)

## 概述
本技能指导 Corvus Agent 如何在与用户的对话中，根据领域业务需求编写、安装、定制与管理新的 **Skill（技能包）**，使 Agent 能够沉淀特定技术栈或工作流的工程规范。

---

## 技能存储规范与目录层级

Corvus 支持两层技能存储，遵循就近与优先覆盖原则：

1. **全局技能 (Global Skills)**：
   - 存储路径：`~/.corvus/skills/<skill-id>/SKILL.md`（或工作区外的全局 `.corvus/skills/<skill-id>/SKILL.md`）
   - 作用域：所有项目与所有会话通用。
2. **项目级技能 (Project Workspace Skills)**：
   - 存储路径：`<当前项目工作区根目录>/.corvus/skills/<skill-id>/SKILL.md`
   - 作用域：仅当前工作区生效。如果项目级技能的 `skill-id` 与全局技能重名，系统将优先采用项目级定义。

---

## SKILL.md 编写标准模板

每个技能必须是一个包含 `SKILL.md` 的独立文件夹。`SKILL.md` 采用标准 Markdown 格式：

```markdown
---
name: skill-id
description: 一句话说明技能何时使用
triggers:
  - 用户可能说出的触发短语
tools_required:
  - required_tool_name
---
# [技能中文名称] ([英文标识/简写])

## 概述
简要描述该技能的目标、核心适用场景，以及 Agent 在面对何种任务时应激活此规范。

## 核心流程与执行准则
1. 步骤一：...
2. 步骤二：...
3. 步骤三：...

## 代码规范 / 规则清单
- 规则 1：...
- 规则 2：...

## 常见错误与避坑指南
- 风险点 1 与防护对策...
- 风险点 2 与防护对策...
```

---

## 对话式安装技能的标准工作流

当用户在聊天中提出："帮我创建一个 Vue3 + TS 开发技能"、"增加一个编写自动化测试的 Skill" 时，请执行以下步骤：

1. **确定技能元数据与作用域**：
   - 确定技能 ID（如 `vue3-ts-expert`、`security-audit`，采用全小写连字符命名法）。
   - 询问或推断技能作用域（项目级还是全局）。若用户在具体工程中对话，推荐写入 `<workspace>/.corvus/skills/<id>/SKILL.md`。
2. **编写专业 Markdown 内容**：
   - 提炼行业最佳实践、特定框架规范（如命名规则、设计模式、类型定义、安全禁忌）。
3. **写入文件系统**：
   - 使用 `write_file` 创建目录及 `SKILL.md` 文件。
4. **验证与关联**：
   - 如果用户希望特定 Agent Role 默认携带该技能，可检查并引导更新 `config.json` 中的 `agentRoles[roleId].skills` 列表。
5. **向用户反馈**：
   - 展示新建技能的标题与落盘路径。
   - 提示用户可在 WebUI 的 **Skills（技能）** 页面中直接浏览此技能卡片。
