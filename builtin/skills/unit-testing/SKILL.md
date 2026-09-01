---
name: unit-testing
description: 设计、实现并验证自动化测试
triggers: [write tests, unit test, 编写测试, 单元测试]
tools_required: [shell]
---
# 自动化单元测试与质量保障 (Unit Testing)

## 概述
本技能指导 Agent 编写高质量、高覆盖率、无副作用的单元与集成测试（支持 Vitest, Jest, Pytest 等流行框架），确保核心逻辑健壮且具有完备的回归保护。

---

## 编写测试的核心准则 (AAA 模式)

每个测试用例应严格遵循 **AAA (Arrange-Act-Assert)** 结构：
1. **Arrange (准备)**：初始化数据、配置、Mock 外部依赖或虚拟环境。
2. **Act (执行)**：调用被测函数或执行操作。
3. **Assert (断言)**：验证返回值、状态变化或事件通知。

---

## 质量要求与最佳实践

1. **测试隔离与无副作用**：
   - 使用临时目录（如 `tmpdir` / `mkdtemp`）进行文件与 SQLite 测试。
   - 在 `afterEach` 或 `finally` 块中清理临时文件、注销事件监听与定时器。
2. **边界与异常测试**：
   - 不仅测试 Happy Path（正常用例），必须覆盖：
     - 空输入、超长字符串、畸形 JSON、非法字符。
     - 网络超时、4xx/5xx HTTP 错误处理。
     - 文件不存在、权限不足等 IO 失败情况。
3. **确定性 (Deterministic)**：
   - 避免在测试中断言易变的时间戳，使用相对断言或 Mock 虚拟时钟。
