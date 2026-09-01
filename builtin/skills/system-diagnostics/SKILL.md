---
name: system-diagnostics
description: 诊断进程、端口、环境变量和网络故障
triggers: [diagnose, troubleshoot, 故障诊断, 端口占用]
tools_required: [shell]
---
# 系统与环境故障诊断指南 (System Diagnostics)

## 概述
本技能提供在不同操作系统（Windows, macOS, Linux）下排查系统异常、进程卡死、端口冲突、环境变量缺失与网络异常的标准诊断工具集与分析路径。

---

## 常用跨平台诊断命令清单

### 1. 🔍 端口占用与网络监听排查
- **Windows (PowerShell)**:
  ```powershell
  Get-NetTCPConnection -LocalPort <端口号> | Select-Object OwningProcess, LocalAddress, State
  ```
- **Linux / macOS**:
  ```bash
  lsof -i :<端口号> || netstat -tuln | grep <端口号>
  ```

### 2. ⚡ 进程查询与清理
- **Windows**:
  - 查询：`Get-Process -Name <名称>` 或 `tasklist /fi "imagename eq <名称>.exe"`
  - 结束进程：`Stop-Process -Id <PID> -Force` 或 `taskkill /pid <PID> /f`
- **Linux / macOS**:
  - 查询：`ps aux | grep <名称>`
  - 结束进程：`kill -9 <PID>`

### 3. 🌐 环境变量与 Node 运行路径
- **Windows**:
  ```powershell
  $env:PATH -split ';'
  Get-Command node, npm, npx, python | Select-Object Source
  ```
- **Linux / macOS**:
  ```bash
  echo $PATH | tr ':' '\n'
  which node npm npx python3
  ```

---

## 故障排查逻辑决策树

1. **若遇到 `EADDRINUSE`（端口冲突）**：
   - 先用上述网络命令查出占用该端口的进程 PID。
   - 确认该进程是否为旧的残留开发服务器，向用户确认后终止该 PID。
2. **若遇到 `ENOENT`（找不到文件或命令）**：
   - 检查当前执行工作目录（CWD）是否存在。
   - 检查可执行命令是否在 PATH 中，或改用系统绝对路径。
3. **若遇到权限不足（`EACCES` / `EPERM`）**：
   - 检查文件是否被其他进程独占（如 SQLite `.db-wal` 锁）。
   - 检查目标路径写权限。
