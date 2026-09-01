<div align="center">

# 🦅 CorvusAI

**下一代多项目 AI 智能体编排平台与本地 Agent OS**

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-Durable_State-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![MCP](https://img.shields.io/badge/MCP-Native_Interoperability-FF6B6B?style=for-the-badge)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

[English](README.md) • [简体中文](README_zh.md) • [官方文档](docs/) • [问题反馈](https://github.com/RavenholmAlpha/CorvusAI/issues)

</div>

---

## 📖 目录

- [项目概述](#-项目概述)
- [核心特性](#-核心特性)
- [系统架构](#-系统架构)
- [快速开始](#-快速开始)
- [双重交互界面](#-双重交互界面)
  - [磁带未来风终端 TUI](#1-磁带未来风终端-tui)
  - [Web 控制台](#2-web-控制台)
- [CLI 命令行参考](#-cli-命令行参考)
- [TUI 斜杠指令集](#-tui-斜杠指令集)
- [内置工具全景](#-内置工具全景)
- [配置与安全体系](#-配置与安全体系)
  - [分层配置机制](#分层配置机制)
  - [秘钥管理与零泄漏脱敏](#秘钥管理与零泄漏脱敏)
  - [权限预设与安全策略](#权限预设与安全策略)
- [MCP (Model Context Protocol) 互联](#-mcp-model-context-protocol-互联)
- [技能系统 (Skills)](#-技能系统-skills)
- [插件开发 (Plugins)](#-插件开发-plugins)
- [测试与质量验证](#-测试与质量验证)
- [开源协议](#-开源协议)

---

## 🌟 项目概述

**CorvusAI** 是专为复杂软件工程与自动化协作打造的工业级、本地优先（Local-first）**AI 智能体编排平台与 Agent 操作系统（Agent OS）**。基于现代 Node.js (22+)、TypeScript、React 19 以及 SQLite 构建，Corvus 融合了极具极客质感的**磁带未来主义终端界面（Ink TUI）**与功能完备的**现代化响应式 Web 控制台（Vite + React 19 + SSE 实时流）**。

Corvus 突破了传统单一对话包装器的局限，提供**SQLite 强持久化状态机**、**多项目工作区隔离**、**基于专家角色的子智能体蜂群协作（Scope Lease 并发防冲突）**、**MCP 双向协议互联**以及**零信任可插拔权限控制体系**。

```text
               ┌────────────────────────────────────────────────┐
               │              全局编排层 (Orchestrator)          │
               └───────┬────────────────────────────────┬───────┘
                       │                                │
         ┌─────────────▼─────────────┐    ┌─────────────▼─────────────┐
         │  项目运行时: Web 前端工程   │    │  项目运行时: 后端核心服务   │
         │  ├─ 持久化主会话 (Session) │    │  ├─ 持久化主会话 (Session) │
         │  ├─ 结构化项目记忆图谱     │    │  ├─ 结构化项目记忆图谱     │
         │  ├─ 作用域租约 (Leases)   │    │  ├─ 作用域租约 (Leases)   │
         │  └─ 专家角色子智能体集群   │    │  └─ 专家角色子智能体集群   │
         └───────────────────────────┘    └───────────────────────────┘
```

---

## ✨ 核心特性

| 核心维度 | 功能说明 |
|---|---|
| 🧠 **多项目 Agent OS** | 全局编排器统一管理跨工作区的独立智能体运行时，支持多项目注册、关键词意图跨项目路由与跨工程任务分发。 |
| ⚡ **持久化 Harness 状态机** | 基于 SQLite (`~/.corvus/corvus.db`) 记录 Run 执行流、Steps、Message 状态快照、工具调用队列与只追加事件审计日志，支持进程崩溃后精准恢复 (`/resume <id>`)。 |
| 🌐 **多模型与通用协议网关** | 原生兼容 `openai-chat` (`/chat/completions`)、`openai-responses` (`/responses`) 与 `anthropic-messages` (`/messages`)。支持 DeepSeek、Claude、OpenAI、本地 Ollama/vLLM 以及故障转移链路与 Token 预算。 |
| 🛡️ **零信任权限与人工介入** | 内置 3 档权限预设（`safe` / `balanced` / `autonomous`），支持工具与能力粒度 ACL 规则（`tool:<name>` / `capability:<name>`），集成路径沙箱、终端防护与系统 Keyring 加密秘钥存储 (`store:KEY`)。 |
| 🔌 **双向 MCP 原生互联** | **客户端**：一键自动扫描并导入 Claude Desktop、Cursor (全局/工作区) 与 Codex 的 MCP 配置；**服务端**：将 Corvus 暴露为 stdio MCP Server (`corvus mcp-serve`) 供外部 IDE 调用。 |
| 🤖 **子智能体蜂群与并发协作** | 支持专家角色委派 (`agentRoles`)、批量并发任务调度 (`parallel_tasks`) 以及作用域租约（Scope Lease）协调，杜绝多智能体并行修改同一文件导致的代码冲突。 |
| 📚 **精选项目记忆图谱** | 自动沉淀架构决策、设计模式、踩坑经验与交接上下文，支持哈希/向量语义检索（`search_global_memory`）与跨会话知识继承。 |
| 🕸️ **CDP 浏览器自动化与远程节点** | 深度集成 Chrome DevTools Protocol 自动化控制（打开网页、DOM 结构快照、坐标点击、文本键入、截图捕捉）与本地/SSH/Docker 远程执行节点管控。 |
| 🖥️ **双重交互控制平面** | 极速全键盘操作的磁带未来风终端（TUI）与实时流驱动的现代化 Web 控制台（WebUI）自由无缝切换。 |
| ⏰ **自动化任务与 Webhook 接入** | 支持 Cron / 间隔定时任务与事件驱动调度器，提供带 Bearer Token 鉴权的 Webhook 入口，轻松打通 CI/CD 与告警系统。 |

---

## 🏗️ 系统架构

```mermaid
graph TD
    User([用户 / 外部系统]) -->|CLI / TUI / Web 控制台 / Webhooks| Gateway[接入与网关层]
    Gateway --> Orchestrator[全局编排器 (Global Orchestrator)]
    
    subgraph "Agent OS 核心运行时"
        Orchestrator --> PM[多项目管理器与注册表]
        PM --> PR1[项目运行时: Alpha]
        PM --> PR2[项目运行时: Beta]
        
        PR1 --> MS[主会话与上下文流]
        PR1 --> SM[子智能体管理器]
        SM --> SA1[前端设计专家子智能体]
        SM --> SA2[架构评审专家子智能体]
        
        PR1 --> Mem[记忆引擎与知识图谱]
        PR1 --> Leases[并发作用域租约协调器]
    end
    
    subgraph "持久化 Harness (SQLite)"
        MS --> TQ[工具调度队列与并发限制]
        TQ --> DB[(~/.corvus/corvus.db<br/>Runs / Steps / Approvals / Evidence / Events)]
    end
    
    subgraph "执行与集成层"
        TQ --> Tools[内置工程工具集]
        TQ --> MCP[MCP 协议管理器 / 客户端]
        TQ --> Plugins[独立进程插件沙箱 Host]
        TQ --> Browser[Chrome CDP 浏览器自动化]
        TQ --> Nodes[执行节点: 本地 / SSH / Docker]
    end
    
    subgraph "多模型驱动"
        MS & SA1 & SA2 --> MultiProvider[大模型客户端网关]
        MultiProvider --> P1[OpenAI / DeepSeek / Ollama<br/>openai-chat 协议]
        MultiProvider --> P2[OpenAI Responses<br/>openai-responses 协议]
        MultiProvider --> P3[Anthropic Claude<br/>anthropic-messages 协议]
    end
```

---

## 🚀 快速开始

### 环境依赖

- **Node.js 22.0.0+**（支持 Linux、macOS 与 Windows）。

### 安装方式

#### 方式 1：NPM 全局安装（推荐）

```bash
# 从 npm 官方仓库全局安装
npm install --global @ravenholmalpha/corvus

# 启动交互式 TUI
corvus
```

#### 方式 2：npx 免安装直接运行

```bash
npx --yes @ravenholmalpha/corvus
```

#### 方式 3：源码一键自动化安装脚本

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/RavenholmAlpha/CorvusAI/main/scripts/install.sh | bash -s -- --preset default

# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/RavenholmAlpha/CorvusAI/main/scripts/install.ps1 | iex
```

### 常用启动参数

```bash
# 启动磁带未来风终端交互界面 (默认)
corvus

# 同时启动终端 TUI 与 Web 控制台
corvus --web

# 仅在后台启动 Web 控制台 (不占用终端输入)
corvus --web-only --web-port 3081

# 单次无头执行 Prompt 并直接输出结果
corvus -p "分析当前工作区的工程架构并输出技术总结"

# 指定打开特定项目工作区
corvus --project /path/to/my-project

# 恢复指定的持久化执行流 (Run)
corvus --resume run_01jb8c9x...
```

---

## 🖥️ 双重交互界面

### 1. 磁带未来风终端 TUI

Corvus 采用基于 React + Ink 构建的极客终端 UI，专为键盘优先的高效开发者打造。

```text
┌─ CORVUS 控制中心 ──────────────────────────┬─ 智能体实时运行时数据流 ────────────┐
│ > 1. 当前工作区: CorvusAI                   │ [System] 模型: deepseek-chat       │
│   2. 目标设定: 实现持久化状态机              │ [Agent] 正在检索代码架构...        │
│   3. 系统配置                               │                                    │
│   4. 执行记录与审批 (1 个待确认)             │ ❯ read_file { path: "src/cli.ts" } │
│   5. 项目记忆图谱                           │ ✔ 执行完成: 成功读取 791 行代码。  │
│   6. 技能与插件                             │                                    │
│   7. 退出系统                               │ Corvus: 架构验证完毕，准备下一步。 │
└─────────────────────────────────────────────┴────────────────────────────────────┘
```

- **交互式配置向导**：随时输入 `/setting wizard` 即可进入分步配置向导，快速配置 Provider、模型、Endpoint 与 API Key，无需手动修改 JSON。
- **任务控制看板**：输入 `/deck` 或 `/menu` 调出全屏任务控制中心。
- **热重载生效**：配置修改在下一次模型调用时立即生效，无需重启进程。

### 2. Web 控制台

执行 `corvus --web` 即可自动打开经过安全 Token 鉴权的本地 Web 控制面板（React 19 + Vite）：

```text
http://127.0.0.1:3000/?token=<session-token>
```

```
├── 📊 全景概览 (Overview)     - 系统健康度、任务吞吐量、活跃执行流与记忆统计
├── 💬 智能对话 (Chat)         - 支持多会话切换、SSE 实时 Token 流式响应与中断控制
├── 📁 项目空间 (Projects)     - 多工作区统一注册、管理与一键切换
├── 🤖 智能体集群 (Agents)     - 全局编排器 → 项目智能体 → 专家角色子任务调用树
├── 📋 任务追踪 (Tasks)        - 实时监控、追踪与取消后台子智能体任务
├── 🛡️ 审批中心 (Approvals)    - 人工介入审批悬浮窗，支持参数审查与 Diff 对比
├── 🧠 记忆图谱 (Memory)       - 交互式项目知识图谱（架构设计、技术决策、避坑指南）
├── 📜 时间线 (Timeline)       - 只追加事件审计流，支持关键词过滤与 JSON 审计导出
├── ⚡ 技能库 (Skills)         - 全局与工作区技能列表、触发词与所需工具展示
├── ⏰ 自动化 (Automations)    - 定时任务 (Cron) 与周期调度器状态监控
├── 📡 渠道集成 (Channels)     - 鉴权 Webhook 接入管理与异步投递队列
├── 🔀 意图路由 (Routing)      - 跨项目关键词自动路由规则配置
├── 🌐 浏览器自动化 (Browser)  - Chrome CDP 实时视口监控与网页管理
├── 🖥️ 执行节点 (Nodes)        - Local、SSH、Docker 远程执行节点状态与命令分发
├── 🧩 MCP 互联 (Integrations) - 外部 MCP 服务自动发现、一键导入与 OAuth 鉴权
├── 📦 功能套件 (Installation) - 功能预设切换（Minimal / Default / Full）与插件管理
└── ⚙️ 系统设置 (Settings)     - 模型 Provider、Role 规则、安全沙箱与数据库备份
```

---

## ⌨️ CLI 命令行参考

```bash
corvus [选项] [子命令] [prompt]
```

### 核心参数

| 参数 | 简写 | 功能说明 |
|---|---|---|
| `--version` | `-v` | 输出 Corvus 当前版本号 |
| `--help` | `-h` | 显示命令行帮助文档 |
| `--web` | | 启动终端 TUI 的同时拉起 Web 控制台 |
| `--web-only` | | 仅在后台启动 Web 控制台（无终端交互） |
| `--web-port <port>` | | 自定义 Web 控制台端口（默认：`3000` / `3081`） |
| `--project <path>` | `-P` | 指定启动并激活的目标工程目录 |
| `--print "<prompt>"` | `-p` | 无头模式执行单次 Prompt 并输出结果 |
| `--resume <runId>` | | 恢复执行指定处于暂停或待审批状态的持久化 Run |
| `--auto-approve` | `-y` | 自动批准所有工具执行请求（请在受信任环境下使用） |
| `--restore-db <file>` | | 启动前从备份文件还原 SQLite 数据库 |

### 子命令一览

```bash
# 系统健康检查与深度环境诊断
corvus doctor [--json] [--deep]

# 功能预设管理 (minimal | default | full | custom)
corvus bundle plan <preset>
corvus bundle apply <preset>

# 插件生态管理
corvus plugin list
corvus plugin install <path-or-repo>
corvus plugin enable <plugin-id>
corvus plugin disable <plugin-id>
corvus plugin remove <plugin-id>

# 本地加密秘钥存储 (Keyring)
corvus secret list
corvus secret set <key-name>
corvus secret delete <key-name>

# Model Context Protocol (MCP) 相关
corvus mcp-serve                     # 作为 stdio MCP 服务运行，供 Cursor/Claude 调用
corvus mcp-import [--dry-run]        # 自动导入 Cursor/Claude/Codex 的 MCP 服务器
corvus mcp-oauth <server-id>         # 为指定 MCP 服务执行 OAuth 授权

# 权限预设快速切换 (safe | balanced | autonomous)
corvus permission safe
corvus permission balanced
corvus permission autonomous
```

---

## 🕹️ TUI 斜杠指令集

在终端交互界面中输入 `/` 即可调用以下运行时指令：

### 会话与基础导航
- `/menu`, `/deck`：呼出全屏任务控制中心。
- `/status`：显示当前模型、Provider、Endpoint、工具、插件及权限状态。
- `/sessions`：查看并切换持久化对话会话。
- `/workspace`：查看注册的项目列表或切换当前激活的工作区。
- `/clear`：清空终端显示视口。
- `/compact`：手动压缩会话上下文窗口。
- `/exit`：优雅退出 Corvus 运行时。

### 运行记录与人工审批
- `/runs`：列出所有持久化执行记录与运行状态。
- `/run <id>`：查看指定 Run 的详细消息记录与状态快照。
- `/resume <id>`：恢复指定暂停的持久化 Run。
- `/cancel <id>`：取消运行中的 Run 或子任务。
- `/approvals`：列出所有等待人工确认的工具调用。
- `/approve <id|all>`：批准指定或全部待确认的工具调用。
- `/deny <id|all>`：拒绝工具调用。
- `/evidence [id|last]`：查看工具执行输出、异常堆栈或模型失败存证。

### 配置与安全策略
- `/setting wizard`：启动交互式分步配置向导。
- `/setting [show|key value]`：运行时查看或修改配置项。
- `/model [name] [--endpoint url] [--api-key KEY]`：快捷切换主模型配置。
- `/permission [tool:name|capability:name] [allow|ask|deny]`：设置工具/能力粒度权限规则。
- `/preset [safe|balanced|autonomous]`：切换权限预设。
- `/goal [text]`：设定或显示当前全局任务目标。
- `/review [on|off|status]`：开启/关闭自动代码审查 Prompt 约束。
- `/tools`：列出当前所有可用工具及其权限策略。
- `/plugins`：查看已加载插件及其健康度。
- `/config`：展示当前分层配置聚合结果。

---

## 🧰 内置工具全景

Corvus 预装了覆盖现代研发全生命周期的安全工具集：

### 📁 文件系统与系统终端
| 工具名称 | 能力标签 | 默认策略 | 功能描述 |
|---|---|---|---|
| `read_file` | `local` | `allow` | 读取文件内容，支持单次最大字节限制与目录越界沙箱检查。 |
| `write_file` | `local` | `ask` | 写入文件内容，支持自动递归创建父级目录。 |
| `replace_file_content` | `local` | `ask` | 安全地进行单块精确文本匹配与替换。 |
| `patch_file` | `local` | `ask` | 对目标文件应用标准统一 Patch 代码补丁。 |
| `list_dir` | `local` | `allow` | 遍历指定目录并输出详细元数据与子项统计。 |
| `grep_search` | `local` | `allow` | 高性能正则与字面量文件内容全文检索。 |
| `shell` | `shell` | `ask` | 在沙箱环境中执行终端命令，支持超时保护与输出截断。 |
| `git_status` | `local` | `allow` | 查询当前 Git 分支、变更文件、暂存区与提交状态。 |

### 🤖 多智能体与编排调度
| 工具名称 | 能力标签 | 默认策略 | 功能描述 |
|---|---|---|---|
| `task` | `local` | `allow` | 派生一个独立的子智能体，指定专家角色执行具体子任务。 |
| `parallel_tasks` | `local` | `allow` | 并发执行多个子智能体任务，并由租约协调器保障文件写入隔离。 |
| `dispatch_project_task` | `orchestrator` | `allow` | 将任务跨项目分发至其他已注册的工作区。 |
| `check_subagent_task` | `agent` | `allow` | 查询已分发子任务的持久化执行状态、产物与错误信息。 |
| `manage_role` | `orchestrator` | `ask` | 创建、更新或删除可复用的专家角色（Role）配置。 |
| `list_workspaces` | `orchestrator` | `allow` | 列出系统中所有已注册的项目工作区及最新会话。 |
| `register_workspace` | `orchestrator` | `ask` | 将新的本地项目目录注册进全局多项目管理中心。 |
| `unregister_workspace` | `orchestrator` | `ask` | 注销项目注册记录（不会删除磁盘实际文件）。 |
| `get_workspace_summary` | `orchestrator` | `allow` | 快速汇总工作区的技术栈、Git 状态与核心架构记忆。 |

### 🧠 项目记忆与知识图谱
| 工具名称 | 能力标签 | 默认策略 | 功能描述 |
|---|---|---|---|
| `record_project_memory` | `orchestrator` | `allow` | 沉淀架构设计、技术决策、避坑经验或交接记忆。 |
| `search_global_memory` | `orchestrator` | `allow` | 基于哈希/向量嵌入算法在全局或项目范围内检索关联知识。 |

### 🌐 CDP 浏览器自动化
| 工具名称 | 能力标签 | 默认策略 | 功能描述 |
|---|---|---|---|
| `browser_pages` | `browser.control` | `allow` | 列出当前连接 Chrome 实例中的所有标签页。 |
| `browser_open` | `browser.control` | `ask` | 在新标签页中打开安全的 HTTP/HTTPS 公网地址。 |
| `browser_navigate` | `browser.control` | `ask` | 驱动已有标签页导航至指定网页。 |
| `browser_snapshot` | `browser.control` | `allow` | 获取当前页面的结构化 DOM 无障碍可访问性树快照。 |
| `browser_click` | `browser.control` | `ask` | 点击当前页面指定坐标位置。 |
| `browser_type` | `browser.control` | `ask` | 在当前聚焦输入框中键入非敏感文本内容。 |
| `browser_press` | `browser.control` | `ask` | 触发键盘按键事件（Enter、Escape、Tab 等）。 |
| `browser_screenshot` | `browser.control` | `allow` | 捕获视口或全页面 Base64 PNG 屏幕截图。 |

### 🔌 生态扩展与系统工具
| 工具名称 | 能力标签 | 默认策略 | 功能描述 |
|---|---|---|---|
| `web_fetch` | `network` | `ask` | 发起安全 HTTP 请求，内置 SSRF 防护与安全公网校验。 |
| `now` | `local` | `allow` | 获取当前高精度 ISO 时间戳与时区信息。 |
| `manage_mcp` | `orchestrator` | `ask` | 动态管理、导入、测试并热重载 MCP 服务器连接。 |
| `manage_skill` | `orchestrator` | `ask` | 创建、管理或删除全局与工作区专属技能。 |

---

## 🔒 配置与安全体系

### 分层配置机制

Corvus 采用确定性的 3 级配置继承合并机制：

```text
内置默认层 (builtin/)  <  用户全局配置 (~/.corvus/config.json)  <  工作区专属配置 (<workspace>/.corvus/config.json)
```

```json
{
  "$schema": "./schema/config.schema.json",
  "schemaVersion": 2,
  "endpoint": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "apiKeyRef": "env:DEEPSEEK_API_KEY",
  "temperature": 0.2,
  "providers": {
    "deepseek": {
      "id": "deepseek",
      "protocol": "openai-chat",
      "endpoint": "https://api.deepseek.com/v1",
      "model": "deepseek-chat",
      "apiKeyRef": "env:DEEPSEEK_API_KEY"
    },
    "claude": {
      "id": "claude",
      "protocol": "anthropic-messages",
      "endpoint": "https://api.anthropic.com/v1",
      "model": "claude-3-7-sonnet-20250219",
      "apiKeyRef": "store:ANTHROPIC_KEY"
    }
  },
  "agentRoles": {
    "reviewer": {
      "id": "reviewer",
      "label": "代码架构审查专家",
      "providerId": "claude",
      "systemPrompt": "专注于代码审查，重点关注安全性、性能瓶颈与代码可维护性。"
    }
  },
  "permissions": {
    "preset": "balanced",
    "rules": {
      "tool:shell": "ask",
      "tool:write_file": "ask",
      "capability:network": "ask"
    }
  }
}
```

### 秘钥管理与零泄漏脱敏

- **环境变量引用**：使用 `apiKeyRef: "env:VAR_NAME"` 直接读取系统环境变量，避免明文秘钥落盘。
- **系统 Keyring 加密存储**：使用 `corvus secret set <name>` 结合 `apiKeyRef: "store:SECRET_NAME"`，将秘钥安全存放于本地操作系统的加密 Keyring 中。
- **自动遮罩脱敏**：所有 API 秘钥在终端日志、Web 接口响应、SSE 事件流与数据库导出中均会被自动检测并打码脱敏。

### 权限预设与安全策略

| 预设等级 | 文件只读 / 状态查询 | 文件写入 / Patch | 终端命令执行 | 网络外部请求 | 浏览器自动化操作 |
|---|---|---|---|---|---|
| 🟢 `safe` (安全模式) | `allow` | `ask` | `deny` | `ask` | `ask` |
| 🟡 `balanced` (平衡模式-默认) | `allow` | `ask` | `ask` | `ask` | `ask` |
| 🔴 `autonomous` (自主极客模式) | `allow` | `allow` | `allow` | `allow` | `allow` |

可通过命令行 `corvus permission <preset>` 或 TUI 指令 `/permission preset <name>` 随时秒级切换。

---

## 🌐 MCP (Model Context Protocol) 互联

Corvus 对 Anthropic 发起的 **Model Context Protocol (MCP)** 提供了原生的双向深度支持：

### 1. 客户端模式：一键导入外部服务

自动扫描并导入来自 Claude Desktop、Cursor（全局与工作区）以及 Codex 的 MCP 配置：

```bash
# 试运行预览已发现的 MCP 服务列表
corvus mcp-import --dry-run

# 真正导入并合并至 ~/.corvus/config.json
corvus mcp-import
```

### 2. 服务端模式：向外部 IDE 暴露智能体能力

将 Corvus 及其麾下的工具与子智能体网络暴露为标准的 stdio MCP Server，直接嵌入 Claude Desktop 或 Cursor：

在 `claude_desktop_config.json` 或 Cursor MCP 配置中追加：

```json
{
  "mcpServers": {
    "corvus": {
      "command": "corvus",
      "args": ["mcp-serve"]
    }
  }
}
```

---

## ⚡ 技能系统 (Skills)

技能是独立的领域能力扩展包，由包含 `SKILL.md` 的独立目录构成。

### 加载优先级顺序

```text
内置技能 (dist/builtin/skills/) < 用户全局技能 (~/.corvus/skills/) < 工作区技能 (<workspace>/.corvus/skills/)
```

### 编写自定义技能 (`SKILL.md`)

```markdown
---
name: "git-release"
description: "自动化语义化版本发版、Changelog 生成与 GitHub Release 流程"
triggers:
  - "发布版本"
  - "发版"
  - "bump version"
tools_required:
  - "shell"
  - "read_file"
  - "write_file"
---

# Git 发版工作流指南

1. 使用 `git_status` 校验当前工作区是否干净。
2. 读取 `package.json` 中的当前版本号。
3. 执行版本自增，自动更新 CHANGELOG 并打上 Release Git Tag。
```

当用户输入匹配触发词时，技能指南将按需精准激活注入系统上下文。

---

## 🔌 插件开发 (Plugins)

Corvus 拥有基于 Manifest v1 规范的插件系统，运行在隔离的 Worker 线程中。

### 插件清单 (`corvus-plugin.json`)

```json
{
  "manifestVersion": 1,
  "id": "my-custom-plugin",
  "name": "自定义领域插件",
  "version": "1.0.0",
  "description": "为 Corvus 提供专属的业务能力工具",
  "entry": "dist/index.js",
  "capabilities": ["local", "network"],
  "contributes": {
    "tools": [
      {
        "name": "custom_action",
        "description": "执行自定义业务逻辑",
        "capability": "local"
      }
    ]
  }
}
```

### 插件 SDK 开发示例

```typescript
import { definePlugin } from "@ravenholmalpha/corvus/plugin-sdk";

export default definePlugin({
  async activate(context) {
    context.registerTool({
      name: "custom_action",
      description: "执行自定义业务逻辑",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string" }
        },
        required: ["input"]
      },
      async execute({ input }) {
        return { ok: true, output: `已成功处理: ${input}` };
      }
    });
  }
});
```

---

## 🧪 测试与质量验证

Corvus 拥有严苛的质量保障与自动化测试体系，覆盖单元测试、集成测试、WebUI 测试与状态机持久化 E2E 测试：

```bash
# 运行全量测试套件 (CLI + WebUI)
npm test

# 专门执行 WebUI 组件与页面测试
npm run test:web

# 执行全项目 TypeScript 类型严苛检查
npm run lint

# 构建全量生产产物 (WebUI + 核心后端 + 内置技能)
npm run build

# 生成软件物料清单 (SBOM)
npm run sbom

# 生成并签署发布清单 (Release Manifest)
npm run release:manifest
npm run release:sign
```

---

## 📄 开源协议

本项目采用 **MIT License** 开源许可协议。详情请参阅 [LICENSE](LICENSE) 文件。

<div align="center">

**[CorvusAI](https://github.com/RavenholmAlpha/CorvusAI)** — 为弹性、自主与多智能体协作工程而生。

</div>
