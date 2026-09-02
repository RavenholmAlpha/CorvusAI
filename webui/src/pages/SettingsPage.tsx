import React, { useEffect, useState } from "react";
import { Card, Modal, SimpleForm, toast } from "../components";
import { getJson, postJson } from "../api";
import type { PageProps } from "./shared";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "settings.language.title": { en: "Language", "zh-CN": "语言" },
  "settings.provider.editTitle": { en: "Edit Provider [{id}]", "zh-CN": "编辑服务商 [{id}]" },
  "settings.provider.configureTitle": { en: "Configure AI Provider", "zh-CN": "配置 AI 服务商" },
  "settings.provider.presets": { en: "⚡ QUICK PRESETS / COMMON PROVIDERS:", "zh-CN": "⚡ 快速预设 / 常见服务商：" },
  "settings.provider.presetLoaded": { en: "Loaded the {name} preset.", "zh-CN": "已载入 {name} 预设模板。" },
  "settings.provider.endpointRequiredFirst": { en: "Enter the API endpoint first.", "zh-CN": "请先填写 API 服务接口地址。" },
  "settings.provider.discoveringToast": { en: "Discovering available models from the service…", "zh-CN": "正在探测服务端可用模型列表…" },
  "settings.provider.discoveredToast": { en: "Found {count} available models in {latency} ms.", "zh-CN": "成功检测到 {count} 个可用模型（耗时 {latency} 毫秒）。" },
  "settings.provider.discoveryFailed": { en: "Model discovery failed: {error}", "zh-CN": "检测模型失败：{error}" },
  "settings.provider.addedAll": { en: "Added all {count} models to the supported list.", "zh-CN": "已将 {count} 个模型全部加入支持列表。" },
  "settings.provider.idRequired": { en: "Provider ID is required.", "zh-CN": "服务商 ID 是必填项。" },
  "settings.provider.endpointRequired": { en: "API endpoint is required.", "zh-CN": "API 服务接口地址是必填项。" },
  "settings.provider.defaultRequired": { en: "Default model is required.", "zh-CN": "默认模型是必填项。" },
  "settings.provider.saved": { en: "Provider configuration saved.", "zh-CN": "服务商配置保存成功！" },
  "settings.provider.saveFailed": { en: "Failed to save provider: {error}", "zh-CN": "保存服务商失败：{error}" },
  "settings.provider.id": { en: "Provider ID (unique identifier):", "zh-CN": "服务商 ID（唯一标识）：" },
  "settings.provider.displayLabel": { en: "Display label:", "zh-CN": "显示名称：" },
  "settings.provider.protocol": { en: "Protocol:", "zh-CN": "协议类型：" },
  "settings.provider.protocolOpenAI": { en: "openai-chat (standard OpenAI / DeepSeek / Ollama)", "zh-CN": "openai-chat（标准 OpenAI / DeepSeek / Ollama）" },
  "settings.provider.protocolAnthropic": { en: "anthropic-messages (official Claude protocol)", "zh-CN": "anthropic-messages（Claude 官方协议）" },
  "settings.provider.protocolResponses": { en: "openai-responses (experimental Responses protocol)", "zh-CN": "openai-responses（实验性 Responses 协议）" },
  "settings.provider.defaultModel": { en: "Default model:", "zh-CN": "默认主模型：" },
  "settings.provider.chooseDetected": { en: "-- Select a detected model --", "zh-CN": "-- 选择检测到的模型 --" },
  "settings.provider.enterDirectly": { en: "Or enter directly", "zh-CN": "或直接输入" },
  "settings.provider.endpoint": { en: "API endpoint:", "zh-CN": "API 服务接口地址：" },
  "settings.provider.smartSuggestions": { en: "Smart suggestions:", "zh-CN": "智能建议：" },
  "settings.provider.completeV1": { en: "✨ Append /v1", "zh-CN": "✨ 补全 /v1" },
  "settings.provider.completeApiV1": { en: "✨ Append /api/v1", "zh-CN": "✨ 补全 /api/v1" },
  "settings.provider.removeChat": { en: "🪄 Remove redundant /chat/completions", "zh-CN": "🪄 移除多余的 /chat/completions" },
  "settings.provider.removeMessages": { en: "🪄 Remove redundant /messages", "zh-CN": "🪄 移除多余的 /messages" },
  "settings.provider.removeResponses": { en: "🪄 Remove redundant /responses", "zh-CN": "🪄 移除多余的 /responses" },
  "settings.provider.plainKey": { en: "Plain API key (optional):", "zh-CN": "明文 API 密钥（可选）：" },
  "settings.provider.keepKey": { en: "Leave blank to keep the existing key", "zh-CN": "留空保持原密钥不变" },
  "settings.provider.keyRef": { en: "API key secret reference (environment variable):", "zh-CN": "API 密钥引用（环境变量）：" },
  "settings.provider.onlineDiscovery": { en: "🔍 Online model discovery", "zh-CN": "🔍 可用模型在线探测" },
  "settings.provider.discoveryHelp": { en: "Fetch every model supported by this provider using the current endpoint and key.", "zh-CN": "根据当前填写的 API 服务接口与密钥在线拉取该服务商支持的全部模型。" },
  "settings.provider.discovering": { en: "⏳ Discovering…", "zh-CN": "⏳ 探测中…" },
  "settings.provider.discover": { en: "🔍 Discover models", "zh-CN": "🔍 检测可用模型" },
  "settings.provider.found": { en: "✓ Found {count} models ({latency} ms)", "zh-CN": "✓ 检测到 {count} 个模型（耗时 {latency} 毫秒）" },
  "settings.provider.filterModels": { en: "Filter models…", "zh-CN": "过滤模型搜索…" },
  "settings.provider.addAll": { en: "+ Add all to supported list", "zh-CN": "＋ 全部加入支持列表" },
  "settings.provider.setDefaultTitle": { en: "Set as default model", "zh-CN": "设为默认主模型" },
  "settings.provider.setDefault": { en: "Set default", "zh-CN": "设为默认" },
  "settings.provider.removeSupported": { en: "Remove from supported list", "zh-CN": "从支持列表中移除" },
  "settings.provider.addSupported": { en: "Add to supported list", "zh-CN": "加入支持列表" },
  "settings.provider.selected": { en: "✓ Selected", "zh-CN": "✓ 已选" },
  "settings.provider.add": { en: "+ Add", "zh-CN": "+ 加入" },
  "settings.provider.supportedModels": { en: "Supported models (comma-separated):", "zh-CN": "支持模型列表（逗号分隔）：" },
  "settings.provider.modelParameters": { en: "MODEL PARAMETERS (CONTEXT, OUTPUT, TEMPERATURE)", "zh-CN": "模型参数（上下文、输出、温度）" },
  "settings.provider.modelParametersHelp": { en: "Blank values inherit provider/global defaults. Runtime resolves these values for the selected model.", "zh-CN": "留空将继承服务商或全局默认值；运行时会为所选模型解析这些值。" },
  "settings.provider.contextWindow": { en: "Context window", "zh-CN": "上下文窗口" },
  "settings.provider.maxOutput": { en: "Max output", "zh-CN": "最大输出" },
  "settings.provider.temperature": { en: "Temperature", "zh-CN": "温度" },
  "settings.provider.globalPlaceholder": { en: "global", "zh-CN": "全局" },
  "settings.provider.providerPlaceholder": { en: "provider", "zh-CN": "服务商" },
  "settings.provider.advanced": { en: "⚙️ ADVANCED SETTINGS (TIMEOUT, RETRIES, FALLBACK, TEMPERATURE)", "zh-CN": "⚙️ 高级设置（超时、重试、备用服务商、温度）" },
  "settings.provider.temperatureRange": { en: "Temperature (0.0–2.0):", "zh-CN": "温度（0.0–2.0）：" },
  "settings.provider.timeout": { en: "Timeout (ms):", "zh-CN": "超时（毫秒）：" },
  "settings.provider.maxRetries": { en: "Maximum retries:", "zh-CN": "最大重试次数：" },
  "settings.provider.fallbacks": { en: "Fallback provider IDs:", "zh-CN": "备用服务商 ID 列表：" },
  "settings.provider.saveChanges": { en: "Save Changes", "zh-CN": "保存更改" },
  "settings.provider.commit": { en: "Commit Provider Record", "zh-CN": "提交服务商记录" },
  "settings.permission.title": { en: "Permission Mode", "zh-CN": "权限模式" },
  "settings.permission.help": { en: "Choose whether risky tools pause for inline approval or run autonomously.", "zh-CN": "选择高风险工具是暂停等待内联审批，还是自主运行。" },
  "settings.permission.ask": { en: "ASK", "zh-CN": "询问" },
  "settings.permission.askHelp": { en: "Pause risky tools for approval", "zh-CN": "暂停高风险工具并等待审批" },
  "settings.permission.autonomous": { en: "YOLO / AUTONOMOUS", "zh-CN": "YOLO / 自主" },
  "settings.permission.autonomousHelp": { en: "Allow all tool capabilities", "zh-CN": "允许全部工具能力" },
  "settings.permission.askEnabled": { en: "Ask mode enabled.", "zh-CN": "询问模式已启用。" },
  "settings.permission.autoEnabled": { en: "YOLO / autonomous mode enabled.", "zh-CN": "YOLO / 自主模式已启用。" },
  "settings.permission.failed": { en: "Failed to update permission mode: {error}", "zh-CN": "更新权限模式失败：{error}" },
  "settings.providers.title": { en: "AI Providers", "zh-CN": "AI 服务商" },
  "settings.providers.add": { en: "+ ADD PROVIDER", "zh-CN": "＋ 添加服务商" },
  "settings.providers.primary": { en: "★ [PRIMARY]", "zh-CN": "★ [主服务商]" },
  "settings.providers.defaultModel": { en: "Default model:", "zh-CN": "默认模型：" },
  "settings.providers.more": { en: "+{count} more", "zh-CN": "另有 {count} 个" },
  "settings.providers.test": { en: "TEST", "zh-CN": "测试" },
  "settings.providers.edit": { en: "EDIT", "zh-CN": "编辑" },
  "settings.providers.main": { en: "MAIN", "zh-CN": "主服务商" },
  "settings.providers.setMain": { en: "SET MAIN", "zh-CN": "设为主服务商" },
  "settings.providers.delete": { en: "DEL", "zh-CN": "删除" },
  "settings.providers.empty": { en: "No external providers configured. Using global default.", "zh-CN": "未配置外部服务商，正在使用全局默认值。" },
  "settings.providers.testing": { en: "Testing connection to provider…", "zh-CN": "正在测试服务商连接…" },
  "settings.providers.connected": { en: "Connected in {latency} ms: {content}", "zh-CN": "已连接（耗时 {latency} 毫秒）：{content}" },
  "settings.providers.connectionFailed": { en: "Connection failed: {error}", "zh-CN": "连接失败：{error}" },
  "settings.providers.primaryUpdated": { en: "Updated primary provider.", "zh-CN": "主服务商已更新。" },
  "settings.providers.primaryFailed": { en: "Failed to update primary provider: {error}", "zh-CN": "更新主服务商失败：{error}" },
  "settings.providers.confirmDelete": { en: "Delete provider [{id}]?", "zh-CN": "确定要删除服务商 [{id}] 吗？" },
  "settings.providers.deleted": { en: "Deleted provider [{id}].", "zh-CN": "已删除服务商 [{id}]。" },
  "settings.providers.deleteHttpFailed": { en: "Delete failed: HTTP {status}", "zh-CN": "删除失败：HTTP {status}" },
  "settings.providers.deleteFailed": { en: "Failed to delete provider: {error}", "zh-CN": "删除服务商失败：{error}" },
  "settings.roles.title": { en: "Agent Roles & Profiles", "zh-CN": "代理角色与配置档案" },
  "settings.roles.add": { en: "+ ADD ROLE", "zh-CN": "＋ 添加角色" },
  "settings.roles.providerModel": { en: "Provider: {provider} / Model: {model}", "zh-CN": "服务商：{provider} / 模型：{model}" },
  "settings.roles.providerDefault": { en: "provider default", "zh-CN": "服务商默认值" },
  "settings.roles.noInstructions": { en: "No custom instructions", "zh-CN": "无自定义指令" },
  "settings.roles.empty": { en: "No custom roles registered.", "zh-CN": "尚未注册自定义角色。" },
  "settings.roles.configure": { en: "Configure Agent Role", "zh-CN": "配置代理角色" },
  "settings.roles.id": { en: "Role ID:", "zh-CN": "角色标识：" },
  "settings.roles.label": { en: "Display label:", "zh-CN": "显示名称：" },
  "settings.roles.providerId": { en: "Associated provider ID:", "zh-CN": "关联的服务商 ID：" },
  "settings.roles.model": { en: "Model override:", "zh-CN": "模型覆盖：" },
  "settings.roles.systemPrompt": { en: "System prompt:", "zh-CN": "系统指令提示词：" },
  "settings.roles.permissions": { en: "🛡️ TOOL PERMISSIONS & RECURSION CONSTRAINTS", "zh-CN": "🛡️ 工具权限与递归限制" },
  "settings.roles.allowedTools": { en: "Allowed tools (comma-separated):", "zh-CN": "允许工具（逗号分隔）：" },
  "settings.roles.deniedTools": { en: "Denied tools:", "zh-CN": "禁用高危工具：" },
  "settings.roles.maxConcurrent": { en: "Maximum concurrent tasks:", "zh-CN": "最大并发任务：" },
  "settings.roles.maxDepth": { en: "Maximum subagent depth:", "zh-CN": "最大子代理递归深度：" },
  "settings.roles.skills": { en: "Associated skills (comma-separated):", "zh-CN": "绑定技能名（逗号分隔）：" },
  "settings.roles.committed": { en: "Role record committed.", "zh-CN": "角色记录已提交。" },
  "settings.roles.commitFailed": { en: "Failed to commit role: {error}", "zh-CN": "提交角色失败：{error}" },
  "settings.roles.commit": { en: "Commit Role Record", "zh-CN": "提交角色记录" },
  "settings.diagnostics.title": { en: "System Diagnostics", "zh-CN": "系统诊断" },
  "settings.diagnostics.ok": { en: "✓ ALL SYSTEMS OPERATIONAL (0 DIAGNOSTIC ERRORS)", "zh-CN": "✓ 所有系统运行正常（0 个诊断错误）" },
  "settings.overflow.title": { en: "Context Overflow", "zh-CN": "上下文溢出" },
  "settings.overflow.help": { en: "When switching to a smaller model, compact with the previous model when possible or immediately retain a sliding window.", "zh-CN": "切换到更小的模型时，尽可能使用原模型压缩上下文，或立即保留滑动窗口。" },
  "settings.overflow.compact": { en: "Compact with previous model (fallback to sliding window)", "zh-CN": "使用原模型压缩（回退到滑动窗口）" },
  "settings.overflow.sliding": { en: "Sliding window only", "zh-CN": "仅使用滑动窗口" },
  "settings.overflow.save": { en: "SAVE OVERFLOW MODE", "zh-CN": "保存溢出模式" },
  "settings.overflow.updated": { en: "Context overflow behavior updated.", "zh-CN": "上下文溢出行为已更新。" },
  "settings.overflow.failed": { en: "Failed to update overflow behavior: {error}", "zh-CN": "更新溢出行为失败：{error}" },
  "settings.execution.title": { en: "Execution & Tool Loop Guard", "zh-CN": "执行与工具循环保护" },
  "settings.execution.help": { en: "Configure limits on recursive model turns and repeated polling tool calls (such as reading terminal status or awaiting background tasks).", "zh-CN": "配置递归模型轮次和重复轮询工具调用的限制（例如读取终端状态或等待后台任务）。" },
  "settings.execution.rounds": { en: "Max tool rounds (0 = unlimited):", "zh-CN": "最大工具轮次（0 = 不限）：" },
  "settings.execution.repeated": { en: "Max repeated identical calls (0 = no limit):", "zh-CN": "最大连续相同调用次数（0 = 不限）：" },
  "settings.execution.unlimited": { en: "0 (unlimited)", "zh-CN": "0（不限）" },
  "settings.execution.noLimit": { en: "0 (no limit)", "zh-CN": "0（不限）" },
  "settings.execution.strict": { en: "Enable strict loop protection (strict 3-call cutoff)", "zh-CN": "启用严格循环保护（连续 3 次调用后截断）" },
  "settings.execution.save": { en: "SAVE EXECUTION POLICY", "zh-CN": "保存执行策略" },
  "settings.execution.updated": { en: "Execution & loop guard settings applied.", "zh-CN": "执行与循环保护设置已应用。" },
  "settings.execution.failed": { en: "Failed to update settings: {error}", "zh-CN": "更新设置失败：{error}" },
  "settings.browser.title": { en: "Browser Runtime (CDP)", "zh-CN": "浏览器运行时（CDP）" },
  "settings.browser.endpoint": { en: "CDP endpoint:", "zh-CN": "CDP 接口地址：" },
  "settings.browser.notConfigured": { en: "Not configured", "zh-CN": "未配置" },
  "settings.browser.field": { en: "Chrome DevTools Protocol (CDP) WebSocket / HTTP URL", "zh-CN": "Chrome DevTools Protocol（CDP）WebSocket / HTTP 地址" },
  "settings.browser.updated": { en: "Updated CDP browser configuration.", "zh-CN": "CDP 浏览器配置已更新。" },
  "settings.common.saveFailed": { en: "Failed to save: {error}", "zh-CN": "保存失败：{error}" },
  "settings.nodes.title": { en: "Execution Nodes", "zh-CN": "执行节点" },
  "settings.nodes.id": { en: "Node identifier", "zh-CN": "节点标识" },
  "settings.nodes.label": { en: "Display label", "zh-CN": "显示名称" },
  "settings.nodes.type": { en: "Type (local, SSH, Docker)", "zh-CN": "类型（本地、SSH、Docker）" },
  "settings.nodes.host": { en: "Host", "zh-CN": "主机" },
  "settings.nodes.user": { en: "User", "zh-CN": "用户" },
  "settings.nodes.container": { en: "Container name", "zh-CN": "容器名称" },
  "settings.nodes.cwd": { en: "Working directory", "zh-CN": "工作目录" },
  "settings.nodes.registered": { en: "Registered execution node.", "zh-CN": "执行节点已注册。" },
  "settings.nodes.failed": { en: "Failed to add node: {error}", "zh-CN": "添加节点失败：{error}" },
  "settings.security.title": { en: "Database & Security Operations", "zh-CN": "数据库与安全操作" },
  "settings.security.session": { en: "• Web session security token active.", "zh-CN": "• Web 会话安全令牌已启用。" },
  "settings.security.redacted": { en: "• Provider API keys are automatically redacted in client state.", "zh-CN": "• 服务商 API 密钥会在客户端状态中自动隐藏。" },
  "settings.security.env": { en: "• Use apiKeyRef=env:VARIABLE_NAME for secure environment-variable resolution.", "zh-CN": "• 使用 apiKeyRef=env:VARIABLE_NAME 安全解析环境变量。" },
  "settings.security.backup": { en: "CREATE DATABASE BACKUP", "zh-CN": "创建数据库备份" },
  "settings.security.raw": { en: "EDIT RAW CONFIG JSON", "zh-CN": "编辑原始配置 JSON" },
  "settings.security.generating": { en: "Generating SQLite snapshot…", "zh-CN": "正在生成 SQLite 快照…" },
  "settings.security.created": { en: "Database backup created: {path}", "zh-CN": "数据库备份已创建：{path}" },
  "settings.security.failed": { en: "Backup failed: {error}", "zh-CN": "备份失败：{error}" },
  "settings.raw.title": { en: "Corvus Master Configuration (JSON)", "zh-CN": "Corvus 主配置（JSON）" },
  "settings.raw.validate": { en: "VALIDATE & SAVE", "zh-CN": "验证并保存" },
  "settings.raw.applied": { en: "Configuration validated and applied.", "zh-CN": "配置已验证并应用。" },
  "settings.raw.invalid": { en: "Invalid JSON or validation failure: {error}", "zh-CN": "JSON 无效或验证失败：{error}" },
  "settings.raw.loadFailed": { en: "Failed to load config: {error}", "zh-CN": "加载配置失败：{error}" },
});

interface ProviderPreset {
  name: string;
  id: string;
  label: string;
  endpoint: string;
  protocol: "openai-chat" | "openai-responses" | "anthropic-messages";
  defaultModel: string;
  models: string[];
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: "DeepSeek",
    id: "deepseek",
    label: "DeepSeek 官方 API",
    endpoint: "https://api.deepseek.com/v1",
    protocol: "openai-chat",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    name: "OpenAI",
    id: "openai",
    label: "OpenAI 官方 API",
    endpoint: "https://api.openai.com/v1",
    protocol: "openai-chat",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "o1-mini", "o3-mini"],
  },
  {
    name: "OpenRouter",
    id: "openrouter",
    label: "OpenRouter 全模型聚合",
    endpoint: "https://openrouter.ai/api/v1",
    protocol: "openai-chat",
    defaultModel: "anthropic/claude-3.7-sonnet",
    models: ["anthropic/claude-3.7-sonnet", "deepseek/deepseek-r1", "openai/gpt-4o"],
  },
  {
    name: "Anthropic Claude",
    id: "anthropic",
    label: "Anthropic Claude 官方",
    endpoint: "https://api.anthropic.com/v1",
    protocol: "anthropic-messages",
    defaultModel: "claude-3-7-sonnet-20250219",
    models: ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
  },
  {
    name: "硅基流动 (SiliconFlow)",
    id: "siliconflow",
    label: "SiliconFlow 硅基流动",
    endpoint: "https://api.siliconflow.cn/v1",
    protocol: "openai-chat",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    models: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct"],
  },
  {
    name: "Ollama (本地)",
    id: "ollama-local",
    label: "Ollama 本地大模型",
    endpoint: "http://127.0.0.1:11434/v1",
    protocol: "openai-chat",
    defaultModel: "qwen2.5-coder:latest",
    models: ["qwen2.5-coder:latest", "llama3.3:latest", "deepseek-r1:latest"],
  },
  {
    name: "Groq (极速推理)",
    id: "groq",
    label: "Groq 极速推理",
    endpoint: "https://api.groq.com/openai/v1",
    protocol: "openai-chat",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b"],
  },
  {
    name: "Moonshot (Kimi)",
    id: "moonshot",
    label: "Moonshot Kimi",
    endpoint: "https://api.moonshot.cn/v1",
    protocol: "openai-chat",
    defaultModel: "moonshot-v1-8k",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  },
  {
    name: "智谱 GLM",
    id: "zhipu",
    label: "智谱 BigModel",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    protocol: "openai-chat",
    defaultModel: "glm-4-plus",
    models: ["glm-4-plus", "glm-4-flash", "glm-4-long"],
  },
  {
    name: "LM Studio (本地)",
    id: "lm-studio",
    label: "LM Studio 本地",
    endpoint: "http://127.0.0.1:1234/v1",
    protocol: "openai-chat",
    defaultModel: "local-model",
    models: ["local-model"],
  },
];

function ProviderModal({
  initialProvider,
  onClose,
  onSaved,
}: {
  initialProvider?: any;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    id: initialProvider?.id || "",
    label: initialProvider?.label || "",
    protocol: initialProvider?.protocol || "openai-chat",
    endpoint: initialProvider?.endpoint || "",
    apiKey: initialProvider?.apiKey || "",
    apiKeyRef: initialProvider?.apiKeyRef || "",
    defaultModel: initialProvider?.defaultModel || (initialProvider?.models && initialProvider.models[0]) || "",
    models: Array.isArray(initialProvider?.models) ? initialProvider.models.join(", ") : (initialProvider?.models || ""),
    temperature: initialProvider?.temperature ?? 0.7,
    timeoutMs: initialProvider?.timeoutMs ?? 60000,
    maxRetries: initialProvider?.maxRetries ?? 2,
    fallbackProviderIds: Array.isArray(initialProvider?.fallbackProviderIds) ? initialProvider.fallbackProviderIds.join(", ") : "",
    modelSettings: initialProvider?.modelSettings ?? {},
  });

  const [discovering, setDiscovering] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [discoverLatency, setDiscoverLatency] = useState<number | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  const handleApplyPreset = (preset: ProviderPreset) => {
    setSelectedPreset(preset.name);
    setFormData((prev) => ({
      ...prev,
      id: prev.id || preset.id,
      label: prev.label || preset.label,
      endpoint: preset.endpoint,
      protocol: preset.protocol,
      defaultModel: preset.defaultModel,
      models: preset.models.join(", "),
    }));
    toast.info(t("settings.provider.presetLoaded", { name: preset.name }));
  };

  const handleDiscoverModels = async () => {
    if (!formData.endpoint.trim()) {
      toast.error(t("settings.provider.endpointRequiredFirst"));
      return;
    }
    try {
      setDiscovering(true);
      setDiscoveredModels([]);
      setDiscoverLatency(null);
      toast.info(t("settings.provider.discoveringToast"));
      const res = await postJson<{ ok: boolean; models: string[]; latencyMs: number }>(
        "/api/providers/discover-models",
        {
          endpoint: formData.endpoint,
          apiKey: formData.apiKey,
          apiKeyRef: formData.apiKeyRef,
          protocol: formData.protocol,
        }
      );
      if (res.ok && res.models) {
        setDiscoveredModels(res.models);
        setDiscoverLatency(res.latencyMs);
        toast.success(t("settings.provider.discoveredToast", { count: res.models.length, latency: res.latencyMs }));
        if (!formData.defaultModel && res.models.length > 0) {
          setFormData((prev) => ({ ...prev, defaultModel: res.models[0] }));
        }
      }
    } catch (err) {
      toast.error(t("settings.provider.discoveryFailed", { error: String(err) }));
    } finally {
      setDiscovering(false);
    }
  };

  // Compute smart URL suffix suggestion pills
  const endpointTrim = formData.endpoint.trim();
  const urlSuggestions: Array<{ label: string; action: () => void }> = [];
  if (endpointTrim) {
    const rawNoSlash = endpointTrim.replace(/\/+$/, "");
    if (
      !rawNoSlash.endsWith("/v1") &&
      !rawNoSlash.endsWith("/v4") &&
      !rawNoSlash.includes("/v1/") &&
      !rawNoSlash.includes("/api/")
    ) {
      urlSuggestions.push({
        label: t("settings.provider.completeV1"),
        action: () => setFormData((p) => ({ ...p, endpoint: rawNoSlash + "/v1" })),
      });
      urlSuggestions.push({
        label: t("settings.provider.completeApiV1"),
        action: () => setFormData((p) => ({ ...p, endpoint: rawNoSlash + "/api/v1" })),
      });
    }
    if (rawNoSlash.endsWith("/chat/completions")) {
      urlSuggestions.push({
        label: t("settings.provider.removeChat"),
        action: () => setFormData((p) => ({ ...p, endpoint: rawNoSlash.replace(/\/chat\/completions$/, "") })),
      });
    }
    if (rawNoSlash.endsWith("/messages")) {
      urlSuggestions.push({
        label: t("settings.provider.removeMessages"),
        action: () => setFormData((p) => ({ ...p, endpoint: rawNoSlash.replace(/\/messages$/, "") })),
      });
    }
    if (rawNoSlash.endsWith("/responses")) {
      urlSuggestions.push({
        label: t("settings.provider.removeResponses"),
        action: () => setFormData((p) => ({ ...p, endpoint: rawNoSlash.replace(/\/responses$/, "") })),
      });
    }
  }

  const currentModelsList = formData.models
    .split(",")
    .map((m: string) => m.trim())
    .filter(Boolean);

  const toggleModelInList = (modelId: string) => {
    const set = new Set(currentModelsList);
    if (set.has(modelId)) {
      set.delete(modelId);
    } else {
      set.add(modelId);
    }
    setFormData((prev) => ({ ...prev, models: Array.from(set).join(", ") }));
  };

  const setAllDiscoveredModels = () => {
    if (discoveredModels.length === 0) return;
    setFormData((prev) => ({ ...prev, models: discoveredModels.join(", ") }));
    toast.info(t("settings.provider.addedAll", { count: discoveredModels.length }));
  };

  const filteredDiscoveredModels = discoveredModels.filter((m) =>
    modelFilter ? m.toLowerCase().includes(modelFilter.toLowerCase()) : true
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id.trim()) {
      toast.error(t("settings.provider.idRequired"));
      return;
    }
    if (!formData.endpoint.trim()) {
      toast.error(t("settings.provider.endpointRequired"));
      return;
    }
    if (!formData.defaultModel.trim()) {
      toast.error(t("settings.provider.defaultRequired"));
      return;
    }

    try {
      const payload: Record<string, any> = {
        id: formData.id.trim(),
        label: formData.label.trim() || formData.id.trim(),
        protocol: formData.protocol,
        endpoint: formData.endpoint.trim(),
        defaultModel: formData.defaultModel.trim(),
        models: formData.models || formData.defaultModel.trim(),
        temperature: Number(formData.temperature) || 0.7,
        timeoutMs: Number(formData.timeoutMs) || 60000,
        maxRetries: Number(formData.maxRetries) || 2,
        modelSettings: formData.modelSettings,
      };
      if (formData.apiKey) payload.apiKey = formData.apiKey;
      if (formData.apiKeyRef) payload.apiKeyRef = formData.apiKeyRef;
      if (formData.fallbackProviderIds) payload.fallbackProviderIds = formData.fallbackProviderIds;

      await postJson("/api/providers", payload);
      toast.success(t("settings.provider.saved"));
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(t("settings.provider.saveFailed", { error: String(err) }));
    }
  };

  return (
    <Modal title={initialProvider ? t("settings.provider.editTitle", { id: initialProvider.id }) : t("settings.provider.configureTitle")} onClose={onClose}>
      {/* Preset Quick-Fill Bar */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px", fontFamily: "var(--font-mono)" }}>
          {t("settings.provider.presets")}
        </div>
        <div className="preset-chips">
          {PROVIDER_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={"preset-chip " + (selectedPreset === p.name ? "active" : "")}
              onClick={() => handleApplyPreset(p)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="simple-form">
        <div className="form-grid-2col">
          <label>
            {t("settings.provider.id")}
            <input
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              placeholder="e.g. main-openai"
              required
              disabled={Boolean(initialProvider)}
            />
          </label>
          <label>
            {t("settings.provider.displayLabel")}
            <input
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="OpenAI GPT-4o"
              required
            />
          </label>
          <label>
            {t("settings.provider.protocol")}
            <select
              value={formData.protocol}
              onChange={(e) => setFormData({ ...formData, protocol: e.target.value as any })}
            >
              <option value="openai-chat">{t("settings.provider.protocolOpenAI")}</option>
              <option value="anthropic-messages">{t("settings.provider.protocolAnthropic")}</option>
              <option value="openai-responses">{t("settings.provider.protocolResponses")}</option>
            </select>
          </label>
          <label>
            {t("settings.provider.defaultModel")}
            {discoveredModels.length > 0 ? (
              <div style={{ display: "flex", gap: "6px" }}>
                <select
                  value={formData.defaultModel}
                  onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
                  style={{ flex: 1 }}
                >
                  <option value="">{t("settings.provider.chooseDetected")}</option>
                  {discoveredModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  style={{ width: "120px" }}
                  value={formData.defaultModel}
                  onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
                  placeholder={t("settings.provider.enterDirectly")}
                />
              </div>
            ) : (
              <input
                value={formData.defaultModel}
                onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
                placeholder="gpt-4o / deepseek-chat"
                required
              />
            )}
          </label>
        </div>

        {/* Endpoint Input with Smart URL Auto-Completion */}
        <label style={{ marginTop: "10px" }}>
          {t("settings.provider.endpoint")}
          <input
            value={formData.endpoint}
            onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
            placeholder="https://api.openai.com/v1"
            required
          />
        </label>
        {urlSuggestions.length > 0 && (
          <div className="smart-url-pills">
            <span style={{ fontSize: "11px", color: "var(--amber)", alignSelf: "center", fontFamily: "var(--font-mono)" }}>
              {t("settings.provider.smartSuggestions")}
            </span>
            {urlSuggestions.map((s, idx) => (
              <button key={idx} type="button" className="smart-url-pill" onClick={s.action}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* API Key Inputs */}
        <div className="form-grid-2col" style={{ marginTop: "10px" }}>
          <label>
            {t("settings.provider.plainKey")}
            <input
              type="password"
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder={initialProvider ? t("settings.provider.keepKey") : "sk-..."}
            />
          </label>
          <label>
            {t("settings.provider.keyRef")}
            <input
              value={formData.apiKeyRef}
              onChange={(e) => setFormData({ ...formData, apiKeyRef: e.target.value })}
              placeholder="env:OPENAI_API_KEY"
            />
          </label>
        </div>

        {/* Online Model Discovery Section */}
        <div className="detect-models-bar">
          <div>
            <b style={{ color: "var(--vfd-cyan)", fontSize: "12px" }}>{t("settings.provider.onlineDiscovery")}</b>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {t("settings.provider.discoveryHelp")}
            </div>
          </div>
          <button
            type="button"
            className="primary"
            onClick={handleDiscoverModels}
            disabled={discovering}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            {discovering ? t("settings.provider.discovering") : t("settings.provider.discover")}
          </button>
        </div>

        {/* Discovered Models Interactive Selection Box */}
        {discoveredModels.length > 0 && (
          <div className="model-discovery-box">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ fontSize: "12px", color: "var(--led-green)", fontWeight: 700 }}>
                {t("settings.provider.found", { count: discoveredModels.length, latency: discoverLatency ?? 0 })}
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder={t("settings.provider.filterModels")}
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  style={{ padding: "3px 8px", fontSize: "11px", width: "140px" }}
                />
                <button type="button" style={{ fontSize: "10px", padding: "3px 6px" }} onClick={setAllDiscoveredModels}>
                  ＋ 全部加入支持列表
                </button>
              </div>
            </div>

            <div className="model-badges-grid">
              {filteredDiscoveredModels.map((m) => {
                const isDefault = formData.defaultModel === m;
                const isInList = currentModelsList.includes(m);
                return (
                  <div key={m} className={"model-badge-item " + (isDefault ? "is-default" : "")}>
                    <span style={{ color: isDefault ? "var(--amber-bright)" : "var(--text-main)", fontWeight: 600 }}>
                      {isDefault && "★ "}
                      {m}
                    </span>
                    {!isDefault && (
                      <button
                        type="button"
                        className="model-badge-btn"
                        onClick={() => setFormData((prev) => ({ ...prev, defaultModel: m }))}
                        title={t("settings.provider.setDefaultTitle")}
                      >
                        设为默认
                      </button>
                    )}
                    <button
                      type="button"
                      className="model-badge-btn"
                      onClick={() => toggleModelInList(m)}
                      style={{ color: isInList ? "var(--led-green)" : "var(--text-dim)" }}
                      title={isInList ? t("settings.provider.removeSupported") : t("settings.provider.addSupported")}
                    >
                      {isInList ? t("settings.provider.selected") : t("settings.provider.add")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <label style={{ marginTop: "10px" }}>
          {t("settings.provider.supportedModels")}
          <input
            value={formData.models}
            onChange={(e) => setFormData({ ...formData, models: e.target.value })}
            placeholder="gpt-4o, gpt-4o-mini, o1-mini"
          />
        </label>

        <details style={{ marginTop: "12px", border: "1px dashed var(--border-dark)", borderRadius: "4px", padding: "8px" }}>
          <summary style={{ cursor: "pointer", color: "var(--vfd-cyan)", fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
            {t("settings.provider.modelParameters")}
          </summary>
          <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>{t("settings.provider.modelParametersHelp")}</p>
          {currentModelsList.map((model: string) => {
            const settings = formData.modelSettings[model] ?? {};
            const setSetting = (key: "contextWindowTokens" | "maxOutputTokens" | "temperature", raw: string) => {
              const value = raw === "" ? undefined : Number(raw);
              setFormData((previous) => ({ ...previous, modelSettings: { ...previous.modelSettings, [model]: { ...(previous.modelSettings[model] ?? {}), [key]: value } } }));
            };
            return <div key={model} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 2fr) repeat(3, minmax(100px, 1fr))", gap: "8px", alignItems: "end", marginTop: "8px" }}>
              <code style={{ paddingBottom: "8px" }}>{model}</code>
              <label>{t("settings.provider.contextWindow")}<input aria-label={model + " " + t("settings.provider.contextWindow")} type="number" min="1024" value={settings.contextWindowTokens ?? ""} placeholder={t("settings.provider.globalPlaceholder")} onChange={(event) => setSetting("contextWindowTokens", event.target.value)} /></label>
              <label>{t("settings.provider.maxOutput")}<input aria-label={model + " " + t("settings.provider.maxOutput")} type="number" min="1" value={settings.maxOutputTokens ?? ""} placeholder={t("settings.provider.providerPlaceholder")} onChange={(event) => setSetting("maxOutputTokens", event.target.value)} /></label>
              <label>{t("settings.provider.temperature")}<input aria-label={model + " " + t("settings.provider.temperature")} type="number" min="0" max="2" step="0.1" value={settings.temperature ?? ""} placeholder={t("settings.provider.providerPlaceholder")} onChange={(event) => setSetting("temperature", event.target.value)} /></label>
            </div>;
          })}
        </details>

        {/* Collapsible Advanced Settings */}
        <details style={{ marginTop: "12px", border: "1px dashed var(--border-dark)", borderRadius: "4px", padding: "8px" }}>
          <summary style={{ cursor: "pointer", color: "var(--amber)", fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
            {t("settings.provider.advanced")}
          </summary>
          <div className="form-grid-2col" style={{ marginTop: "8px" }}>
            <label>
              {t("settings.provider.temperatureRange")}
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: Number(e.target.value) })}
                placeholder="0.7"
              />
            </label>
            <label>
              {t("settings.provider.timeout")}
              <input
                type="number"
                value={formData.timeoutMs}
                onChange={(e) => setFormData({ ...formData, timeoutMs: Number(e.target.value) })}
                placeholder="60000"
              />
            </label>
            <label>
              {t("settings.provider.maxRetries")}
              <input
                type="number"
                value={formData.maxRetries}
                onChange={(e) => setFormData({ ...formData, maxRetries: Number(e.target.value) })}
                placeholder="2"
              />
            </label>
            <label>
              {t("settings.provider.fallbacks")}
              <input
                value={formData.fallbackProviderIds}
                onChange={(e) => setFormData({ ...formData, fallbackProviderIds: e.target.value })}
                placeholder="backup-openai, local-ollama"
              />
            </label>
          </div>
        </details>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
          <button type="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="primary">
            {initialProvider ? t("settings.provider.saveChanges") : t("settings.provider.commit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SettingsPage({ state, reload }: PageProps) {
  const { locale, setLocale, t } = useI18n();
  const [providerModalData, setProviderModalData] = useState<{ open: boolean; provider?: any }>({ open: false });
  const [roleOpen, setRoleOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [permissionBusy, setPermissionBusy] = useState(false);

  const setPermissionMode = async (preset: "balanced" | "autonomous") => {
    setPermissionBusy(true);
    try {
      await postJson("/api/permissions/preset", { preset });
      await reload();
      toast.success(t(preset === "autonomous" ? "settings.permission.autoEnabled" : "settings.permission.askEnabled"));
    } catch (error) {
      toast.error(t("settings.permission.failed", { error: String(error) }));
    } finally {
      setPermissionBusy(false);
    }
  };

  useEffect(() => {
    if (rawOpen) {
      void getJson<any>("/api/config")
        .then((value) => setRaw(JSON.stringify(value, null, 2)))
        .catch((err) => toast.error(t("settings.raw.loadFailed", { error: String(err) })));
    }
  }, [rawOpen]);

  const testProvider = async (id: string) => {
    try {
      toast.info(t("settings.providers.testing"));
      const result = await postJson<any>("/api/providers/" + id + "/test");
      toast.success(t("settings.providers.connected", { latency: result.latencyMs, content: result.content || "OK" }));
    } catch (e) {
      toast.error(t("settings.providers.connectionFailed", { error: String(e) }));
    }
  };

  const setMainProvider = async (id: string) => {
    try {
      await postJson("/api/providers/" + id + "/main");
      await reload();
      toast.success(t("settings.providers.primaryUpdated"));
    } catch (e) {
      toast.error(t("settings.providers.primaryFailed", { error: String(e) }));
    }
  };

  const deleteProvider = async (id: string) => {
    if (!window.confirm(t("settings.providers.confirmDelete", { id }))) return;
    try {
      const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("settings.providers.deleted", { id }));
        await reload();
      } else {
        toast.error(t("settings.providers.deleteHttpFailed", { status: res.status }));
      }
    } catch (e) {
      toast.error(t("settings.providers.deleteFailed", { error: String(e) }));
    }
  };

  const createBackup = async () => {
    try {
      toast.info(t("settings.security.generating"));
      const result = await postJson<{ path: string }>("/api/backup");
      toast.success(t("settings.security.created", { path: result.path }));
    } catch (e) {
      toast.error(t("settings.security.failed", { error: String(e) }));
    }
  };

  const [currentZoom, setCurrentZoom] = useState<number>(() => {
    const saved = localStorage.getItem("corvus_ui_zoom");
    return saved ? Number(saved) : 100;
  });

  const updateZoom = (nextZoom: number) => {
    setCurrentZoom(nextZoom);
    const scale = nextZoom / 100;
    (document.documentElement.style as any).zoom = String(scale);
    document.documentElement.style.setProperty("--ui-zoom", String(scale));
    localStorage.setItem("corvus_ui_zoom", String(nextZoom));
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <>
      <div className="grid">
        <Card title={t("settings.appearance.title") || "界面缩放与排版"}>
          <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
            {t("settings.appearance.help") || "调整工作台显示缩放比例及侧边栏默认宽度（也可在顶部栏或直接拖拽侧边栏边缘实时调整）。"}
          </p>

          <div style={{ display: "grid", gap: "14px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ font: "12px var(--font-mono)", color: "var(--amber-bright)" }}>
                  {t("settings.appearance.zoom") || "界面缩放比例"}: <b>{currentZoom}%</b>
                </span>
                <button
                  style={{ fontSize: "10px", padding: "2px 6px" }}
                  onClick={() => updateZoom(100)}
                >
                  {t("settings.appearance.resetZoom") || "恢复 100%"}
                </button>
              </div>
              <input
                type="range"
                min="60"
                max="160"
                step="5"
                value={currentZoom}
                onChange={(e) => updateZoom(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--amber)" }}
              />
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                {[75, 85, 90, 100, 110, 125, 150].map((val) => (
                  <button
                    key={val}
                    className={currentZoom === val ? "primary" : ""}
                    style={{ fontSize: "10px", padding: "3px 8px" }}
                    onClick={() => updateZoom(val)}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px dashed var(--border-dark)", paddingTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ font: "11px var(--font-mono)", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>
                  {t("settings.appearance.mainSidebar") || "主导航栏宽度"}:
                </label>
                <button
                  style={{ fontSize: "10px", padding: "3px 6px" }}
                  onClick={() => {
                    localStorage.setItem("corvus_sidebar_width", "240");
                    document.documentElement.style.setProperty("--sidebar-width", "240px");
                    window.dispatchEvent(new Event("storage"));
                    toast.success("主侧边栏宽度已重置为 240px");
                  }}
                >
                  重置主侧边栏 (240px)
                </button>
              </div>
              <div>
                <label style={{ font: "11px var(--font-mono)", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>
                  {t("settings.appearance.chatSidebar") || "对话会话栏宽度"}:
                </label>
                <button
                  style={{ fontSize: "10px", padding: "3px 6px" }}
                  onClick={() => {
                    localStorage.setItem("corvus_chat_sidebar_width", "290");
                    document.documentElement.style.setProperty("--chat-sidebar-width", "290px");
                    window.dispatchEvent(new Event("storage"));
                    toast.success("对话会话栏宽度已重置为 290px");
                  }}
                >
                  重置会话栏 (290px)
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Card title={t("settings.language.title")}>
          <p style={{ color: "var(--text-muted)", marginTop: 0 }}>{t("language.description")}</p>
          <label>
            {t("language.label")}
            <select value={locale} onChange={(event) => setLocale(event.target.value as "en" | "zh-CN")} style={{ width: "100%", marginTop: "6px" }}>
              <option value="en">{t("language.english")}</option>
              <option value="zh-CN">{t("language.chinese")}</option>
            </select>
          </label>
        </Card>

        <Card title={t("settings.permission.title")}>
          <p style={{ color: "var(--text-muted)", marginTop: 0 }}>{t("settings.permission.help")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
            <button className={state.permissionPreset !== "autonomous" ? "primary" : ""} disabled={permissionBusy} onClick={() => void setPermissionMode("balanced")}>
              {t("settings.permission.ask")} {state.permissionPreset !== "autonomous" ? "✓" : ""}
              <small style={{ display: "block" }}>{t("settings.permission.askHelp")}</small>
            </button>
            <button className={state.permissionPreset === "autonomous" ? "primary" : "danger"} disabled={permissionBusy} onClick={() => void setPermissionMode("autonomous")}>
              {t("settings.permission.autonomous")} {state.permissionPreset === "autonomous" ? "✓" : ""}
              <small style={{ display: "block" }}>{t("settings.permission.autonomousHelp")}</small>
            </button>
          </div>
        </Card>

        <Card
          title={t("settings.providers.title")}
          action={
            <button className="primary" onClick={() => setProviderModalData({ open: true })}>
              {t("settings.providers.add")}
            </button>
          }
        >
          {Object.values(state.providers).length ? (
            Object.values(state.providers).map((p) => (
              <article key={p.id} style={{ marginBottom: "8px" }}>
                <div>
                  <b style={{ color: p.id === state.mainProviderId ? "var(--amber)" : "var(--text-main)" }}>
                    {p.label || p.id} {p.id === state.mainProviderId && t("settings.providers.primary")}
                  </b>
                  <p>{p.protocol} · {t("settings.providers.defaultModel")} <code>{p.defaultModel || (p.models && p.models[0]) || "default"}</code></p>
                  <small style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{p.endpoint}</small>
                  {p.models && p.models.length > 0 && (
                    <div style={{ marginTop: "4px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {p.models.slice(0, 4).map((m: string) => (
                        <span key={m} style={{ fontSize: "10px", background: "#11131a", padding: "1px 5px", borderRadius: "2px", border: "1px solid var(--border-dark)", color: "var(--text-muted)" }}>
                          {m}
                        </span>
                      ))}
                      {p.models.length > 4 && (
                        <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>{t("settings.providers.more", { count: p.models.length - 4 })}</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button onClick={() => void testProvider(p.id)}>{t("settings.providers.test")}</button>
                  <button onClick={() => setProviderModalData({ open: true, provider: p })}>{t("settings.providers.edit")}</button>
                  <button
                    className={p.id === state.mainProviderId ? "primary" : ""}
                    onClick={() => void setMainProvider(p.id)}
                  >
                    {t(p.id === state.mainProviderId ? "settings.providers.main" : "settings.providers.setMain")}
                  </button>
                  <button className="danger" onClick={() => void deleteProvider(p.id)}>{t("settings.providers.delete")}</button>
                </div>
              </article>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)" }}>{t("settings.providers.empty")}</p>
          )}
        </Card>

        <Card
          title={t("settings.roles.title")}
          action={
            <button className="primary" onClick={() => setRoleOpen(true)}>
              {t("settings.roles.add")}
            </button>
          }
        >
          {Object.values(state.roles).length ? (
            Object.values(state.roles).map((r) => (
              <article key={r.id} style={{ marginBottom: "8px" }}>
                <div>
                  <b style={{ color: "var(--amber)" }}>{r.label || r.id}</b>
                  <p>{t("settings.roles.providerModel", { provider: r.providerId, model: r.model || t("settings.roles.providerDefault") })}</p>
                  <small style={{ color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                    {r.systemPrompt || t("settings.roles.noInstructions")}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)" }}>{t("settings.roles.empty")}</p>
          )}
        </Card>

        <Card title={t("settings.diagnostics.title")}>
          {state.diagnostics.length ? (
            state.diagnostics.map((d) => (
              <p key={d.path} className={d.level} style={{ margin: "4px 0", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                [{d.level.toUpperCase()}] {d.path}: {d.message}
              </p>
            ))
          ) : (
            <p className="ok" style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              {t("settings.diagnostics.ok")}
            </p>
          )}
        </Card>

        <Card title={t("settings.overflow.title")}>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: 0 }}>{t("settings.overflow.help")}</p>
          <form onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); try { await postJson("/api/config", { contextOverflowMode: data.get("contextOverflowMode") }); await reload(); toast.success(t("settings.overflow.updated")); } catch (error) { toast.error(t("settings.overflow.failed", { error: String(error) })); } }}>
            <select name="contextOverflowMode" defaultValue={state.contextOverflowMode ?? "compact-with-previous-model"} style={{ width: "100%", marginBottom: "8px" }}>
              <option value="compact-with-previous-model">{t("settings.overflow.compact")}</option>
              <option value="sliding-window">{t("settings.overflow.sliding")}</option>
            </select>
            <button type="submit" className="primary">{t("settings.overflow.save")}</button>
          </form>
        </Card>

        <Card title={t("settings.execution.title")}>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 10px" }}>
            {t("settings.execution.help")}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const formData = new FormData(form);
              const maxToolRounds = Number(formData.get("maxToolRounds") || 0);
              const maxConsecutive = Number(formData.get("maxConsecutiveIdenticalToolCalls") || 0);
              const loopProtection = formData.get("loopProtection") === "true";
              try {
                await postJson("/api/config", {
                  maxToolRounds,
                  maxConsecutiveIdenticalToolCalls: maxConsecutive,
                  loopProtection,
                });
                await reload();
                toast.success(t("settings.execution.updated"));
              } catch (err) {
                toast.error(t("settings.execution.failed", { error: String(err) }));
              }
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "8px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", marginBottom: "4px" }}>
                  {t("settings.execution.rounds")}
                </label>
                <input
                  name="maxToolRounds"
                  type="number"
                  defaultValue={state.maxToolRounds ?? 0}
                  placeholder={t("settings.execution.unlimited")}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", marginBottom: "4px" }}>
                  {t("settings.execution.repeated")}
                </label>
                <input
                  name="maxConsecutiveIdenticalToolCalls"
                  type="number"
                  defaultValue={state.maxConsecutiveIdenticalToolCalls ?? 0}
                  placeholder={t("settings.execution.noLimit")}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-muted)", cursor: "pointer", margin: "6px 0 12px" }}>
              <input
                type="checkbox"
                name="loopProtection"
                value="true"
                defaultChecked={Boolean(state.loopProtection)}
                style={{ width: "auto" }}
              />
              <span>{t("settings.execution.strict")}</span>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="primary">
                {t("settings.execution.save")}
              </button>
            </div>
          </form>
        </Card>

        <Card title={t("settings.browser.title")}>
          <p>{t("settings.browser.endpoint")} <code style={{ color: "var(--vfd-cyan)" }}>{state.browser.cdpEndpoint || t("settings.browser.notConfigured")}</code></p>
          <SimpleForm
            fields={[{ name: "cdpEndpoint", label: t("settings.browser.field"), placeholder: "http://127.0.0.1:9222" }]}
            onSubmit={async (value) => {
              try {
                await postJson("/api/config", { browser: value });
                await reload();
                toast.success(t("settings.browser.updated"));
              } catch (e) {
                toast.error(t("settings.common.saveFailed", { error: String(e) }));
              }
            }}
          />
        </Card>

        <Card title={t("settings.nodes.title")}>
          <pre>{JSON.stringify(state.executionNodes, null, 2)}</pre>
          <SimpleForm
            fields={[
              { name: "id", label: t("settings.nodes.id") },
              { name: "label", label: t("settings.nodes.label") },
              { name: "type", label: t("settings.nodes.type") },
              { name: "host", label: t("settings.nodes.host") },
              { name: "user", label: t("settings.nodes.user") },
              { name: "container", label: t("settings.nodes.container") },
              { name: "cwd", label: t("settings.nodes.cwd") },
            ]}
            onSubmit={async (value) => {
              try {
                await postJson("/api/config", {
                  executionNodes: { ...state.executionNodes, [value.id]: { ...value, enabled: true } },
                });
                await reload();
                toast.success(t("settings.nodes.registered"));
              } catch (e) {
                toast.error(t("settings.nodes.failed", { error: String(e) }));
              }
            }}
          />
        </Card>

        <Card title={t("settings.security.title")}>
          <p>{t("settings.security.session")}</p>
          <p>{t("settings.security.redacted")}</p>
          <p>{t("settings.security.env")}</p>
          <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
            <button className="primary" onClick={() => void createBackup()}>
              {t("settings.security.backup")}
            </button>
            <button onClick={() => setRawOpen(true)}>
              {t("settings.security.raw")}
            </button>
          </div>
        </Card>
      </div>

      {rawOpen && (
        <Modal title={t("settings.raw.title")} onClose={() => setRawOpen(false)}>
          <textarea
            style={{ width: "100%", minHeight: 380, fontFamily: "var(--font-mono)", fontSize: "12px", background: "#0a0b0d", color: "var(--vfd-cyan)", border: "1px solid var(--border-mid)", padding: "12px", borderRadius: "4px" }}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
          />
          <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button onClick={() => setRawOpen(false)}>{t("common.cancel")}</button>
            <button
              className="primary"
              onClick={async () => {
                try {
                  const parsed = JSON.parse(raw);
                  await postJson("/api/config", parsed);
                  setRawOpen(false);
                  await reload();
                  toast.success(t("settings.raw.applied"));
                } catch (e) {
                  toast.error(t("settings.raw.invalid", { error: String(e) }));
                }
              }}
            >
              {t("settings.raw.validate")}
            </button>
          </div>
        </Modal>
      )}

      {providerModalData.open && (
        <ProviderModal
          initialProvider={providerModalData.provider}
          onClose={() => setProviderModalData({ open: false })}
          onSaved={reload}
        />
      )}

      {roleOpen && (
        <Modal title={t("settings.roles.configure")} onClose={() => setRoleOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const formData = new FormData(form);
              const value: Record<string, any> = {};
              formData.forEach((val, key) => {
                if (val !== "") value[key] = val;
              });
              try {
                await postJson("/api/roles", value);
                setRoleOpen(false);
                await reload();
                toast.success(t("settings.roles.committed"));
              } catch (err) {
                toast.error(t("settings.roles.commitFailed", { error: String(err) }));
              }
            }}
            className="simple-form"
          >
            <div className="form-grid-2col">
              <label>
                {t("settings.roles.id")}
                <input name="id" placeholder="e.g. coder, architect, reviewer" required />
              </label>
              <label>
                {t("settings.provider.displayLabel")}
                <input name="label" placeholder="Senior Software Architect" required />
              </label>
              <label>
                {t("settings.roles.providerId")}
                <input name="providerId" placeholder="main-openai" />
              </label>
              <label>
                {t("settings.roles.model")}
                <input name="model" placeholder="gpt-4o" />
              </label>
            </div>

            <label style={{ marginTop: "10px" }}>
              {t("settings.roles.systemPrompt")}
              <textarea name="systemPrompt" rows={4} placeholder="You are an expert full-stack developer..." />
            </label>

            {/* Collapsible Tool Permissions */}
            <details style={{ marginTop: "12px", border: "1px dashed var(--border-dark)", borderRadius: "4px", padding: "8px" }}>
              <summary style={{ cursor: "pointer", color: "var(--amber)", fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {t("settings.roles.permissions")}
              </summary>
              <div className="form-grid-2col" style={{ marginTop: "8px" }}>
                <label>
                  {t("settings.roles.allowedTools")}
                  <input name="allowedTools" placeholder="read_file, write_to_file, run_command" />
                </label>
                <label>
                  {t("settings.roles.deniedTools")}
                  <input name="deniedTools" placeholder="delete_file" />
                </label>
                <label>
                  {t("settings.roles.maxConcurrent")}
                  <input name="maxConcurrent" placeholder="2" />
                </label>
                <label>
                  {t("settings.roles.maxDepth")}
                  <input name="maxChildDepth" placeholder="3" />
                </label>
              </div>
              <label style={{ marginTop: "8px" }}>
                {t("settings.roles.skills")}
                <input name="skills" placeholder="code-review, git-workflow" />
              </label>
            </details>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button type="button" onClick={() => setRoleOpen(false)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="primary">
                {t("settings.roles.commit")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
