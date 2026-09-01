import React, { useEffect, useState } from "react";
import { Card, Modal, SimpleForm, toast } from "../components";
import { getJson, postJson } from "../api";
import type { PageProps } from "./shared";

const providerFields = [
  { name: "id", label: "Provider ID", placeholder: "e.g. main-openai" },
  { name: "label", label: "Display Label", placeholder: "OpenAI GPT-4o" },
  { name: "protocol", label: "Protocol (openai-chat, anthropic-messages)", placeholder: "openai-chat" },
  { name: "endpoint", label: "API Endpoint", placeholder: "https://api.openai.com/v1" },
  { name: "models", label: "Supported Models (comma-separated)", placeholder: "gpt-4o, gpt-4o-mini" },
  { name: "defaultModel", label: "Default Model", placeholder: "gpt-4o" },
  { name: "apiKeyRef", label: "API Key Secret Ref", placeholder: "env:OPENAI_API_KEY" },
  { name: "apiKey", label: "Plain API Key (Optional)", type: "password" },
  { name: "temperature", label: "Temperature (0.0 - 2.0)", placeholder: "0.7" },
  { name: "timeoutMs", label: "Timeout (ms)", placeholder: "60000" },
  { name: "maxRetries", label: "Max Retries", placeholder: "2" },
  { name: "fallbackProviderIds", label: "Fallback Provider IDs (comma-separated)", placeholder: "backup-provider" },
];

const roleFields = [
  { name: "id", label: "Role ID", placeholder: "e.g. coder, reviewer" },
  { name: "label", label: "Display Label", placeholder: "Senior Architect" },
  { name: "providerId", label: "Associated Provider ID", placeholder: "main-openai" },
  { name: "model", label: "Model Override", placeholder: "gpt-4o" },
  { name: "systemPrompt", label: "System Instructions Prompt" },
  { name: "allowedTools", label: "Allowed Tools (comma-separated)", placeholder: "read_file, run_command" },
  { name: "deniedTools", label: "Denied Tools (comma-separated)" },
  { name: "allowedScopes", label: "Allowed Scopes (comma-separated)" },
  { name: "skills", label: "Associated Skills (comma-separated)" },
  { name: "maxConcurrent", label: "Max Concurrent Tasks", placeholder: "2" },
  { name: "maxChildDepth", label: "Max Subagent Recursion Depth", placeholder: "3" },
  { name: "timeoutSeconds", label: "Task Timeout (seconds)", placeholder: "300" },
];

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
    toast.info(`已载入 ${preset.name} 预设模板`);
  };

  const handleDiscoverModels = async () => {
    if (!formData.endpoint.trim()) {
      toast.error("请先填写 API Endpoint 服务接口地址");
      return;
    }
    try {
      setDiscovering(true);
      setDiscoveredModels([]);
      setDiscoverLatency(null);
      toast.info("正在探测服务端可用模型列表...");
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
        toast.success(`成功检测到 ${res.models.length} 个可用模型 (耗时 ${res.latencyMs}ms)`);
        if (!formData.defaultModel && res.models.length > 0) {
          setFormData((prev) => ({ ...prev, defaultModel: res.models[0] }));
        }
      }
    } catch (err) {
      toast.error("检测模型失败: " + String(err));
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
        label: "✨ 补全 /v1",
        action: () => setFormData((p) => ({ ...p, endpoint: rawNoSlash + "/v1" })),
      });
      urlSuggestions.push({
        label: "✨ 补全 /api/v1",
        action: () => setFormData((p) => ({ ...p, endpoint: rawNoSlash + "/api/v1" })),
      });
    }
    if (rawNoSlash.endsWith("/chat/completions")) {
      urlSuggestions.push({
        label: "🪄 移除多余的 /chat/completions",
        action: () => setFormData((p) => ({ ...p, endpoint: rawNoSlash.replace(/\/chat\/completions$/, "") })),
      });
    }
    if (rawNoSlash.endsWith("/messages")) {
      urlSuggestions.push({
        label: "🪄 移除多余的 /messages",
        action: () => setFormData((p) => ({ ...p, endpoint: rawNoSlash.replace(/\/messages$/, "") })),
      });
    }
    if (rawNoSlash.endsWith("/responses")) {
      urlSuggestions.push({
        label: "🪄 移除多余的 /responses",
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
    toast.info(`已将 ${discoveredModels.length} 个模型全部加入支持列表`);
  };

  const filteredDiscoveredModels = discoveredModels.filter((m) =>
    modelFilter ? m.toLowerCase().includes(modelFilter.toLowerCase()) : true
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id.trim()) {
      toast.error("Provider ID 是必填项");
      return;
    }
    if (!formData.endpoint.trim()) {
      toast.error("API Endpoint 是必填项");
      return;
    }
    if (!formData.defaultModel.trim()) {
      toast.error("Default Model 默认模型是必填项");
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
      toast.success("Provider 配置保存成功！");
      await onSaved();
      onClose();
    } catch (err) {
      toast.error("保存 Provider 失败: " + String(err));
    }
  };

  return (
    <Modal title={initialProvider ? `Edit Provider [${initialProvider.id}]` : "Configure AI Provider"} onClose={onClose}>
      {/* Preset Quick-Fill Bar */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px", fontFamily: "var(--font-mono)" }}>
          ⚡ QUICK PRESETS / 常见服务商快速填充:
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
            Provider ID (唯一标识):
            <input
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              placeholder="e.g. main-openai"
              required
              disabled={Boolean(initialProvider)}
            />
          </label>
          <label>
            Display Label (显示名称):
            <input
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="OpenAI GPT-4o"
              required
            />
          </label>
          <label>
            Protocol (协议类型):
            <select
              value={formData.protocol}
              onChange={(e) => setFormData({ ...formData, protocol: e.target.value as any })}
            >
              <option value="openai-chat">openai-chat (标准 OpenAI / DeepSeek / Ollama)</option>
              <option value="anthropic-messages">anthropic-messages (Claude 官方协议)</option>
              <option value="openai-responses">openai-responses (实验性 Responses 协议)</option>
            </select>
          </label>
          <label>
            Default Model (默认主模型):
            {discoveredModels.length > 0 ? (
              <div style={{ display: "flex", gap: "6px" }}>
                <select
                  value={formData.defaultModel}
                  onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
                  style={{ flex: 1 }}
                >
                  <option value="">-- 选择检测到的模型 --</option>
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
                  placeholder="或直接输入"
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
          API Endpoint (服务接口地址):
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
              智能建议:
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
            Plain API Key (可选直接填入密钥):
            <input
              type="password"
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder={initialProvider ? "(留空保持原密钥不变)" : "sk-..."}
            />
          </label>
          <label>
            API Key Secret Ref (环境变量引用):
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
            <b style={{ color: "var(--vfd-cyan)", fontSize: "12px" }}>🔍 可用模型在线探测</b>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              根据当前填写的 API Endpoint 与 Key 在线拉取该服务商支持的全部模型
            </div>
          </div>
          <button
            type="button"
            className="primary"
            onClick={handleDiscoverModels}
            disabled={discovering}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            {discovering ? "⏳ 探测中..." : "🔍 检测可用模型"}
          </button>
        </div>

        {/* Discovered Models Interactive Selection Box */}
        {discoveredModels.length > 0 && (
          <div className="model-discovery-box">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ fontSize: "12px", color: "var(--led-green)", fontWeight: 700 }}>
                ✓ 检测到 {discoveredModels.length} 个模型 (耗时 {discoverLatency}ms)
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="过滤模型搜索..."
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
                        title="设为默认主模型"
                      >
                        设为默认
                      </button>
                    )}
                    <button
                      type="button"
                      className="model-badge-btn"
                      onClick={() => toggleModelInList(m)}
                      style={{ color: isInList ? "var(--led-green)" : "var(--text-dim)" }}
                      title={isInList ? "从支持列表中移除" : "加入支持列表"}
                    >
                      {isInList ? "✓ 已选" : "+ 加入"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <label style={{ marginTop: "10px" }}>
          Supported Models (支持模型列表，逗号分隔):
          <input
            value={formData.models}
            onChange={(e) => setFormData({ ...formData, models: e.target.value })}
            placeholder="gpt-4o, gpt-4o-mini, o1-mini"
          />
        </label>

        <details style={{ marginTop: "12px", border: "1px dashed var(--border-dark)", borderRadius: "4px", padding: "8px" }}>
          <summary style={{ cursor: "pointer", color: "var(--vfd-cyan)", fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
            MODEL PARAMETERS (CONTEXT, OUTPUT, TEMPERATURE)
          </summary>
          <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>Blank values inherit provider/global defaults. Runtime resolves these values for the selected model.</p>
          {currentModelsList.map((model: string) => {
            const settings = formData.modelSettings[model] ?? {};
            const setSetting = (key: "contextWindowTokens" | "maxOutputTokens" | "temperature", raw: string) => {
              const value = raw === "" ? undefined : Number(raw);
              setFormData((previous) => ({ ...previous, modelSettings: { ...previous.modelSettings, [model]: { ...(previous.modelSettings[model] ?? {}), [key]: value } } }));
            };
            return <div key={model} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 2fr) repeat(3, minmax(100px, 1fr))", gap: "8px", alignItems: "end", marginTop: "8px" }}>
              <code style={{ paddingBottom: "8px" }}>{model}</code>
              <label>Context window<input aria-label={model + " context window"} type="number" min="1024" value={settings.contextWindowTokens ?? ""} placeholder="global" onChange={(event) => setSetting("contextWindowTokens", event.target.value)} /></label>
              <label>Max output<input aria-label={model + " max output"} type="number" min="1" value={settings.maxOutputTokens ?? ""} placeholder="provider" onChange={(event) => setSetting("maxOutputTokens", event.target.value)} /></label>
              <label>Temperature<input aria-label={model + " temperature"} type="number" min="0" max="2" step="0.1" value={settings.temperature ?? ""} placeholder="provider" onChange={(event) => setSetting("temperature", event.target.value)} /></label>
            </div>;
          })}
        </details>

        {/* Collapsible Advanced Settings */}
        <details style={{ marginTop: "12px", border: "1px dashed var(--border-dark)", borderRadius: "4px", padding: "8px" }}>
          <summary style={{ cursor: "pointer", color: "var(--amber)", fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
            ⚙️ ADVANCED SETTINGS (TIMEOUT, RETRIES, FALLBACK, TEMPERATURE)
          </summary>
          <div className="form-grid-2col" style={{ marginTop: "8px" }}>
            <label>
              Temperature (温度 0.0 - 2.0):
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
              Timeout Ms (超时毫秒):
              <input
                type="number"
                value={formData.timeoutMs}
                onChange={(e) => setFormData({ ...formData, timeoutMs: Number(e.target.value) })}
                placeholder="60000"
              />
            </label>
            <label>
              Max Retries (最大重试次数):
              <input
                type="number"
                value={formData.maxRetries}
                onChange={(e) => setFormData({ ...formData, maxRetries: Number(e.target.value) })}
                placeholder="2"
              />
            </label>
            <label>
              Fallback Provider IDs (备用 Provider 列表):
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
            Cancel
          </button>
          <button type="submit" className="primary">
            {initialProvider ? "Save Changes" : "Commit Provider Record"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SettingsPage({ state, reload }: PageProps) {
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
      toast.success(preset === "autonomous" ? "YOLO / autonomous mode enabled." : "Ask mode enabled.");
    } catch (error) {
      toast.error("Failed to update permission mode: " + String(error));
    } finally {
      setPermissionBusy(false);
    }
  };

  useEffect(() => {
    if (rawOpen) {
      void getJson<any>("/api/config")
        .then((value) => setRaw(JSON.stringify(value, null, 2)))
        .catch((err) => toast.error("Failed to load config: " + String(err)));
    }
  }, [rawOpen]);

  const testProvider = async (id: string) => {
    try {
      toast.info("Testing connection to provider...");
      const result = await postJson<any>("/api/providers/" + id + "/test");
      toast.success(`Connected in ${result.latencyMs}ms: ${result.content || "OK"}`);
    } catch (e) {
      toast.error("Connection failed: " + String(e));
    }
  };

  const setMainProvider = async (id: string) => {
    try {
      await postJson("/api/providers/" + id + "/main");
      await reload();
      toast.success("Updated primary provider.");
    } catch (e) {
      toast.error("Failed to update main provider: " + String(e));
    }
  };

  const deleteProvider = async (id: string) => {
    if (!window.confirm(`确定要删除 Provider [${id}] 吗？`)) return;
    try {
      const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`已删除 Provider [${id}]`);
        await reload();
      } else {
        toast.error("删除失败: HTTP " + res.status);
      }
    } catch (e) {
      toast.error("删除 Provider 失败: " + String(e));
    }
  };

  const createBackup = async () => {
    try {
      toast.info("Generating SQLite snapshot...");
      const result = await postJson<{ path: string }>("/api/backup");
      toast.success("Database backup created: " + result.path);
    } catch (e) {
      toast.error("Backup failed: " + String(e));
    }
  };

  return (
    <>
      <div className="grid">
        <Card title="Permission Mode">
          <p style={{ color: "var(--text-muted)", marginTop: 0 }}>Choose whether risky tools pause for inline approval or run autonomously.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
            <button className={state.permissionPreset !== "autonomous" ? "primary" : ""} disabled={permissionBusy} onClick={() => void setPermissionMode("balanced")}>
              ASK {state.permissionPreset !== "autonomous" ? "✓" : ""}
              <small style={{ display: "block" }}>Pause risky tools for approval</small>
            </button>
            <button className={state.permissionPreset === "autonomous" ? "primary" : "danger"} disabled={permissionBusy} onClick={() => void setPermissionMode("autonomous")}>
              YOLO / AUTONOMOUS {state.permissionPreset === "autonomous" ? "✓" : ""}
              <small style={{ display: "block" }}>Allow all tool capabilities</small>
            </button>
          </div>
        </Card>

        <Card
          title="AI Providers"
          action={
            <button className="primary" onClick={() => setProviderModalData({ open: true })}>
              ＋ ADD PROVIDER
            </button>
          }
        >
          {Object.values(state.providers).length ? (
            Object.values(state.providers).map((p) => (
              <article key={p.id} style={{ marginBottom: "8px" }}>
                <div>
                  <b style={{ color: p.id === state.mainProviderId ? "var(--amber)" : "var(--text-main)" }}>
                    {p.label || p.id} {p.id === state.mainProviderId && "★ [PRIMARY]"}
                  </b>
                  <p>{p.protocol} · Default Model: <code>{p.defaultModel || (p.models && p.models[0]) || "default"}</code></p>
                  <small style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{p.endpoint}</small>
                  {p.models && p.models.length > 0 && (
                    <div style={{ marginTop: "4px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {p.models.slice(0, 4).map((m: string) => (
                        <span key={m} style={{ fontSize: "10px", background: "#11131a", padding: "1px 5px", borderRadius: "2px", border: "1px solid var(--border-dark)", color: "var(--text-muted)" }}>
                          {m}
                        </span>
                      ))}
                      {p.models.length > 4 && (
                        <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>+{p.models.length - 4} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button onClick={() => void testProvider(p.id)}>TEST</button>
                  <button onClick={() => setProviderModalData({ open: true, provider: p })}>EDIT</button>
                  <button
                    className={p.id === state.mainProviderId ? "primary" : ""}
                    onClick={() => void setMainProvider(p.id)}
                  >
                    {p.id === state.mainProviderId ? "MAIN" : "SET MAIN"}
                  </button>
                  <button className="danger" onClick={() => void deleteProvider(p.id)}>DEL</button>
                </div>
              </article>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)" }}>No external providers configured. Using global default.</p>
          )}
        </Card>

        <Card
          title="Agent Roles & Profiles"
          action={
            <button className="primary" onClick={() => setRoleOpen(true)}>
              ＋ ADD ROLE
            </button>
          }
        >
          {Object.values(state.roles).length ? (
            Object.values(state.roles).map((r) => (
              <article key={r.id} style={{ marginBottom: "8px" }}>
                <div>
                  <b style={{ color: "var(--amber)" }}>{r.label || r.id}</b>
                  <p>Provider: {r.providerId} / Model: {r.model || "provider default"}</p>
                  <small style={{ color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                    {r.systemPrompt || "No custom instructions"}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)" }}>No custom roles registered.</p>
          )}
        </Card>

        <Card title="System Diagnostics">
          {state.diagnostics.length ? (
            state.diagnostics.map((d) => (
              <p key={d.path} className={d.level} style={{ margin: "4px 0", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                [{d.level.toUpperCase()}] {d.path}: {d.message}
              </p>
            ))
          ) : (
            <p className="ok" style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              ✓ ALL SYSTEMS OPERATIONAL (0 DIAGNOSTIC ERRORS)
            </p>
          )}
        </Card>

        <Card title="Context Overflow">
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: 0 }}>When switching to a smaller model, compact with the previous model when possible or immediately retain a sliding window.</p>
          <form onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); try { await postJson("/api/config", { contextOverflowMode: data.get("contextOverflowMode") }); await reload(); toast.success("Context overflow behavior updated."); } catch (error) { toast.error("Failed to update overflow behavior: " + String(error)); } }}>
            <select name="contextOverflowMode" defaultValue={state.contextOverflowMode ?? "compact-with-previous-model"} style={{ width: "100%", marginBottom: "8px" }}>
              <option value="compact-with-previous-model">Compact with previous model (fallback to sliding window)</option>
              <option value="sliding-window">Sliding window only</option>
            </select>
            <button type="submit" className="primary">SAVE OVERFLOW MODE</button>
          </form>
        </Card>

        <Card title="Execution & Tool Loop Guard">
          <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 10px" }}>
            Configure limits on recursive model turns and repeated polling tool calls (such as reading terminal status or awaiting background tasks).
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
                toast.success("Execution & loop guard settings applied.");
              } catch (err) {
                toast.error("Failed to update settings: " + String(err));
              }
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "8px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", marginBottom: "4px" }}>
                  Max Tool Rounds (0 = Unlimited):
                </label>
                <input
                  name="maxToolRounds"
                  type="number"
                  defaultValue={state.maxToolRounds ?? 0}
                  placeholder="0 (unlimited)"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", marginBottom: "4px" }}>
                  Max Repeated Identical Calls (0 = No limit):
                </label>
                <input
                  name="maxConsecutiveIdenticalToolCalls"
                  type="number"
                  defaultValue={state.maxConsecutiveIdenticalToolCalls ?? 0}
                  placeholder="0 (no limit)"
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
              <span>Enable Strict Loop Protection (Strict 3-call cutoff)</span>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="primary">
                SAVE EXECUTION POLICY
              </button>
            </div>
          </form>
        </Card>

        <Card title="Browser Runtime (CDP)">
          <p>CDP Endpoint: <code style={{ color: "var(--vfd-cyan)" }}>{state.browser.cdpEndpoint || "Not configured"}</code></p>
          <SimpleForm
            fields={[{ name: "cdpEndpoint", label: "Chrome DevTools Protocol (CDP) WebSocket / HTTP URL", placeholder: "http://127.0.0.1:9222" }]}
            onSubmit={async (value) => {
              try {
                await postJson("/api/config", { browser: value });
                await reload();
                toast.success("Updated CDP Browser configuration.");
              } catch (e) {
                toast.error("Failed to save: " + String(e));
              }
            }}
          />
        </Card>

        <Card title="Execution Nodes">
          <pre>{JSON.stringify(state.executionNodes, null, 2)}</pre>
          <SimpleForm
            fields={[
              { name: "id", label: "Node Identifier" },
              { name: "label", label: "Display Label" },
              { name: "type", label: "Type (local, ssh, docker)" },
              { name: "host", label: "Host" },
              { name: "user", label: "User" },
              { name: "container", label: "Container Name" },
              { name: "cwd", label: "Working Directory" },
            ]}
            onSubmit={async (value) => {
              try {
                await postJson("/api/config", {
                  executionNodes: { ...state.executionNodes, [value.id]: { ...value, enabled: true } },
                });
                await reload();
                toast.success("Registered execution node.");
              } catch (e) {
                toast.error("Failed to add node: " + String(e));
              }
            }}
          />
        </Card>

        <Card title="Database & Security Operations">
          <p>• Web session security token active.</p>
          <p>• Provider API keys automatically redacted in client state.</p>
          <p>• Use <code>apiKeyRef=env:VARIABLE_NAME</code> for secure env resolution.</p>
          <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
            <button className="primary" onClick={() => void createBackup()}>
              CREATE DATABASE BACKUP
            </button>
            <button onClick={() => setRawOpen(true)}>
              EDIT RAW CONFIG JSON
            </button>
          </div>
        </Card>
      </div>

      {rawOpen && (
        <Modal title="Corvus Master Configuration (JSON)" onClose={() => setRawOpen(false)}>
          <textarea
            style={{ width: "100%", minHeight: 380, fontFamily: "var(--font-mono)", fontSize: "12px", background: "#0a0b0d", color: "var(--vfd-cyan)", border: "1px solid var(--border-mid)", padding: "12px", borderRadius: "4px" }}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
          />
          <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button onClick={() => setRawOpen(false)}>CANCEL</button>
            <button
              className="primary"
              onClick={async () => {
                try {
                  const parsed = JSON.parse(raw);
                  await postJson("/api/config", parsed);
                  setRawOpen(false);
                  await reload();
                  toast.success("Configuration validated & applied.");
                } catch (e) {
                  toast.error("Invalid JSON or validation failure: " + String(e));
                }
              }}
            >
              VALIDATE & SAVE
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
        <Modal title="Configure Agent Role" onClose={() => setRoleOpen(false)}>
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
                toast.success("Role record committed.");
              } catch (err) {
                toast.error("Failed to commit role: " + String(err));
              }
            }}
            className="simple-form"
          >
            <div className="form-grid-2col">
              <label>
                Role ID (角色标识):
                <input name="id" placeholder="e.g. coder, architect, reviewer" required />
              </label>
              <label>
                Display Label (显示名称):
                <input name="label" placeholder="Senior Software Architect" required />
              </label>
              <label>
                Associated Provider ID:
                <input name="providerId" placeholder="main-openai" />
              </label>
              <label>
                Model Override (模型覆盖):
                <input name="model" placeholder="gpt-4o" />
              </label>
            </div>

            <label style={{ marginTop: "10px" }}>
              System Prompt (系统指令提示词):
              <textarea name="systemPrompt" rows={4} placeholder="You are an expert full-stack developer..." />
            </label>

            {/* Collapsible Tool Permissions */}
            <details style={{ marginTop: "12px", border: "1px dashed var(--border-dark)", borderRadius: "4px", padding: "8px" }}>
              <summary style={{ cursor: "pointer", color: "var(--amber)", fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                🛡️ TOOL PERMISSIONS & RECURSION CONSTRAINTS
              </summary>
              <div className="form-grid-2col" style={{ marginTop: "8px" }}>
                <label>
                  Allowed Tools (允许工具，逗号分隔):
                  <input name="allowedTools" placeholder="read_file, write_to_file, run_command" />
                </label>
                <label>
                  Denied Tools (禁用高危工具):
                  <input name="deniedTools" placeholder="delete_file" />
                </label>
                <label>
                  Max Concurrent Tasks (最大并发任务):
                  <input name="maxConcurrent" placeholder="2" />
                </label>
                <label>
                  Max Subagent Depth (最大递归深度):
                  <input name="maxChildDepth" placeholder="3" />
                </label>
              </div>
              <label style={{ marginTop: "8px" }}>
                Associated Skills (绑定技能名，逗号分隔):
                <input name="skills" placeholder="code-review, git-workflow" />
              </label>
            </details>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button type="button" onClick={() => setRoleOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Commit Role Record
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
