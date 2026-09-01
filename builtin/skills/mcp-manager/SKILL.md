---
name: mcp-manager
description: 发现、导入、配置和排查 MCP 服务
triggers: [mcp, mcp server, mcp 服务, 导入 mcp, 安装 mcp, 怎么装 mcp, 配 mcp, install mcp]
tools_required: [write_file]
---
# MCP 服务安装与管理指南 (MCP Manager)

## 概述
本技能指导 Corvus Agent 如何在与用户的日常对话中，无缝完成 **MCP (Model Context Protocol)** 外部工具服务器的发现、配置、依赖安装、连接测试与故障排查。

---

## 配置文件位置与结构
Corvus 的全局配置文件位于 `.corvus/config.json`（或项目所在主目录下的 `.corvus/config.json`）。
所有 MCP 服务声明于 `mcpServers` 顶层配置对象中：

```json
{
  "mcpServers": {
    "server_name": {
      "command": "可执行命令 (如 npx, node, python, uvx)",
      "args": ["参数列表"],
      "env": {
        "ENV_KEY": "环境变量或密钥 (可选)"
      }
    }
  }
}
```

---

## 常用官方与社区 MCP 服务快速安装配方

### 1. 🐙 GitHub MCP (GitHub 仓库/Issue/PR 管理)
- **命令模式**：
  ```json
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "<用户提供的 GitHub Token>"
    }
  }
  ```

### 2. 📁 本地扩展文件系统 MCP (Filesystem)
- **命令模式**：
  ```json
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "d:/target_directory"]
  }
  ```

### 3. 🐘 PostgreSQL 数据库 MCP
- **命令模式**：
  ```json
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:password@localhost:5432/dbname"]
  }
  ```

### 4. 🗄️ SQLite 数据库 MCP
- **命令模式**：
  ```json
  "sqlite": {
    "command": "npx",
    "args": ["-y", "mcp-server-sqlite", "--db-path", "d:/path/to/database.db"]
  }
  ```

### 5. 🌐 Web Fetch 网页抓取与提取 MCP
- **命令模式**：
  ```json
  "fetch": {
    "command": "uvx",
    "args": ["mcp-server-fetch"]
  }
  ```

### 6. 🧠 记忆知识图谱 MCP (Memory)
- **命令模式**：
  ```json
  "memory": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"]
  }
  ```

---

## 对话式安装标准工作流程

当用户在聊天中提出："帮我装一个 GitHub MCP"、"连接我的 Postgres 数据库" 或 "添加一个抓取网页的 MCP" 时，请执行以下步骤：

1. **收集必要参数**：
   - 检查是否需要用户提供 Token 或连接字符串（如 GitHub Token、数据库 URL）。若需要且用户未提供，明确、礼貌地向用户索取。
2. **读取与备份配置**：
   - 使用 `read_file` 读取当前 `.corvus/config.json`。
3. **安全写入配置**：
   - 解析 JSON，向 `mcpServers` 对象添加新的服务定义（如果不存在 `mcpServers` 则新建该属性）。
   - 保持现有所有配置项完整不变，格式化缩进为 2 空格，使用 `write_file` 写回 `.corvus/config.json`。
4. **验证与依赖预检**：
   - 若使用 `npx` 或 `python` / `uvx`，可调用 `shell` 工具进行轻量预检（如 `npx --version` 或预拉取包）。
5. **向用户反馈**：
   - 告知用户配置已成功写入。
   - 告知工具映射规则：服务连接成功后，工具将以 `mcp_{server_name}_{tool_name}` 形式自动注入到工具箱中。
   - 提示用户可在 WebUI 的 **Integrations（集成）** 页面查看连接状态，或重启服务以使新 MCP 进程热加载生效。
