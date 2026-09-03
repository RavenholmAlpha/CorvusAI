import React, { useState } from "react";
import { Card, Modal, toast } from "../components";
import { postJson, deleteJson } from "../api";
import { defineTranslations, useI18n } from "../i18n";
import type { PageProps } from "./shared";

defineTranslations({
  "channels.title": { en: "Webhook & Ingress Channels", "zh-CN": "Webhook & 入站通道" },
  "channels.register": { en: "＋ REGISTER CHANNEL", "zh-CN": "＋ 注册通道" },
  "channels.type": { en: "TYPE: {type}", "zh-CN": "类型：{type}" },
  "channels.endpoint": { en: "ENDPOINT:", "zh-CN": "端点：" },
  "channels.target": { en: "Target: {target} · Role: {role}", "zh-CN": "目标：{target} · 角色：{role}" },
  "channels.orchestrator": { en: "👑 Global Master Orchestrator", "zh-CN": "👑 全局中枢编排器" },
  "channels.project": { en: "📁 Project: {name}", "zh-CN": "📁 项目：{name}" },
  "channels.default": { en: "default", "zh-CN": "默认" },
  "channels.outbound": { en: "Outbound: {url}", "zh-CN": "出站回调：{url}" },
  "channels.noOutbound": { en: "No outbound callback registered", "zh-CN": "未配置出站回调" },
  "channels.empty": { en: "No inbound webhook channels configured.", "zh-CN": "尚未配置入站 Webhook 通道。" },
  "channels.queue": { en: "Outbound Delivery Queue", "zh-CN": "出站投递队列" },
  "channels.delivery": { en: "[{status}] Channel: {id}", "zh-CN": "[{status}] 通道：{id}" },
  "channels.attempts": { en: "Attempts: {count}", "zh-CN": "尝试次数：{count}" },
  "channels.error": { en: "Error: {error}", "zh-CN": "错误：{error}" },
  "channels.queueEmpty": { en: "Outbound delivery queue is empty.", "zh-CN": "出站投递队列为空。" },
  "channels.modal": { en: "Register Ingress Channel", "zh-CN": "注册 Webhook / 入站通道" },
  "channels.presets": { en: "⚡ Quick Templates / Presets (Click to auto-fill):", "zh-CN": "⚡ 快捷模板预设（点击直接填好）：" },
  "channels.id": { en: "Channel Identifier (ID)", "zh-CN": "通道标识符（ID）" },
  "channels.typeField": { en: "Channel Type", "zh-CN": "通道类型" },
  "channels.targetField": { en: "Dispatch Target (Destination)", "zh-CN": "派发路由目标（目的地）" },
  "channels.targetOrchestrator": { en: "👑 Global Master Orchestrator (Cross-workspace)", "zh-CN": "👑 全局中枢编排器（跨工作区协作）" },
  "channels.projectWorkspaces": { en: "📁 Project Workspace", "zh-CN": "📁 项目工作区" },
  "channels.roleField": { en: "Agent Role", "zh-CN": "代理角色" },
  "channels.roleDefault": { en: "⚡ Default Role (Smart Adaptation)", "zh-CN": "⚡ 默认角色（根据任务智能匹配）" },
  "channels.roleCustom": { en: "✍️ Custom role ID...", "zh-CN": "✍️ 手动输入自定义角色 ID..." },
  "channels.token": { en: "Authorization Token Reference (Optional)", "zh-CN": "授权令牌引用（可选）" },
  "channels.callback": { en: "Outbound Callback URL (Optional)", "zh-CN": "出站回调 URL（可选）" },
  "channels.created": { en: "Webhook channel registered successfully.", "zh-CN": "Webhook 通道已成功注册。" },
  "channels.failed": { en: "Failed to save channel: {error}", "zh-CN": "保存通道失败：{error}" },
  "channels.deleted": { en: "Channel deleted.", "zh-CN": "通道已删除。" },
  "channels.deleteFailed": { en: "Failed to delete channel: {error}", "zh-CN": "删除通道失败：{error}" },
  "channels.copyUrl": { en: "📋 Copy URL", "zh-CN": "📋 复制 URL" },
  "channels.copied": { en: "Webhook endpoint copied to clipboard.", "zh-CN": "Webhook 端点地址已复制到剪贴板。" },
  "channels.delete": { en: "Delete", "zh-CN": "删除" },
  "channels.confirmDelete": { en: "Are you sure you want to delete channel '{id}'?", "zh-CN": "确定要删除通道 '{id}' 吗？" },
  "channels.previewUrl": { en: "Ingress Webhook URL Preview (paste this into GitHub/GitLab):", "zh-CN": "入站 Webhook 端点预览（可直接贴入 GitHub / GitLab）：" },
  "channels.submit": { en: "Register Channel", "zh-CN": "确认注册通道" },
  "channels.cancel": { en: "Cancel", "zh-CN": "取消" },
  "channels.toggle": { en: "Toggle", "zh-CN": "启停" },
  "channels.enabled": { en: "ENABLED", "zh-CN": "已启用" },
  "channels.disabled": { en: "DISABLED", "zh-CN": "已禁用" },
});

interface PresetConfig {
  label: string;
  icon: string;
  type: string;
  id: string;
  roleId: string;
  tokenRef: string;
  useOrchestrator: boolean;
  desc: string;
}

const PRESETS: PresetConfig[] = [
  {
    label: "GitHub Webhook",
    icon: "🐱",
    type: "webhook",
    id: "github-webhook",
    roleId: "reviewer",
    tokenRef: "env:GITHUB_WEBHOOK_SECRET",
    useOrchestrator: false,
    desc: "自动处理 Push / PR 代码审查",
  },
  {
    label: "GitLab CI/CD",
    icon: "🦊",
    type: "webhook",
    id: "gitlab-webhook",
    roleId: "developer",
    tokenRef: "env:GITLAB_TOKEN",
    useOrchestrator: false,
    desc: "对接 GitLab Pipeline 与任务触发",
  },
  {
    label: "全局中枢 (Master)",
    icon: "👑",
    type: "webhook",
    id: "master-webhook",
    roleId: "",
    tokenRef: "env:WEBHOOK_SECRET",
    useOrchestrator: true,
    desc: "跨所有工作区派发的全局指令入口",
  },
  {
    label: "Telegram Bot",
    icon: "✈️",
    type: "telegram",
    id: "telegram-bot",
    roleId: "",
    tokenRef: "env:TELEGRAM_BOT_TOKEN",
    useOrchestrator: false,
    desc: "通过 Telegram 机器人与工作区交互",
  },
  {
    label: "Slack Ingress",
    icon: "💬",
    type: "slack",
    id: "slack-ingress",
    roleId: "",
    tokenRef: "env:SLACK_SIGNING_SECRET",
    useOrchestrator: false,
    desc: "接收 Slack 频道消息与指令",
  },
  {
    label: "Discord Webhook",
    icon: "🎮",
    type: "discord",
    id: "discord-webhook",
    roleId: "",
    tokenRef: "env:DISCORD_BOT_TOKEN",
    useOrchestrator: false,
    desc: "接收 Discord 服务器或频道事件",
  },
];

export function ChannelsPage({ state, reload }: PageProps) {
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const { t } = useI18n();

  // Form State
  const defaultProjectId = state.activeProjectId || state.projects[0]?.id || "";
  const [id, setId] = useState("github-webhook");
  const [type, setType] = useState("webhook");
  const [targetMode, setTargetMode] = useState<"orchestrator" | string>(
    defaultProjectId ? defaultProjectId : "orchestrator"
  );
  const [roleId, setRoleId] = useState("");
  const [customRoleId, setCustomRoleId] = useState("");
  const [tokenRef, setTokenRef] = useState("env:WEBHOOK_SECRET");
  const [outboundUrl, setOutboundUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const applyPreset = (p: PresetConfig) => {
    setActivePreset(p.label);
    setType(p.type);
    setId(p.id);
    setTokenRef(p.tokenRef);
    if (p.useOrchestrator) {
      setTargetMode("orchestrator");
    } else if (state.projects.length > 0) {
      setTargetMode(defaultProjectId || state.projects[0].id);
    }
    // Check if role exists, otherwise fallback to default
    if (p.roleId && state.roles && state.roles[p.roleId]) {
      setRoleId(p.roleId);
    } else {
      setRoleId(p.roleId ? p.roleId : "");
    }
  };

  const copyEndpoint = async (channelId: string) => {
    const origin = window.location.origin;
    const url = `${origin}/api/webhooks/${channelId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("channels.copied") + ` (${url})`);
    } catch {
      toast.info(url);
    }
  };

  const handleDelete = async (channelId: string) => {
    if (!window.confirm(t("channels.confirmDelete", { id: channelId }))) return;
    try {
      await deleteJson(`/api/channels/${encodeURIComponent(channelId)}`);
      toast.success(t("channels.deleted"));
      await reload();
    } catch (e) {
      toast.error(t("channels.deleteFailed", { error: String(e) }));
    }
  };

  const handleToggle = async (channelId: string) => {
    try {
      await postJson(`/api/channels/${encodeURIComponent(channelId)}/toggle`);
      await reload();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) {
      toast.error("Channel ID is required.");
      return;
    }

    const useOrchestrator = targetMode === "orchestrator";
    const projectId = useOrchestrator ? undefined : targetMode;
    const finalRoleId = roleId === "__custom__" ? customRoleId.trim() : roleId.trim();

    setSubmitting(true);
    try {
      await postJson("/api/channels", {
        id: id.trim(),
        type,
        useOrchestrator,
        projectId: projectId || undefined,
        roleId: finalRoleId || undefined,
        tokenRef: tokenRef.trim() || undefined,
        outboundUrl: outboundUrl.trim() || undefined,
        enabled: true,
      });
      setOpen(false);
      await reload();
      toast.success(t("channels.created"));
    } catch (err) {
      toast.error(t("channels.failed", { error: String(err) }));
    } finally {
      setSubmitting(false);
    }
  };

  const fullPreviewUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/${id || "your-channel-id"}`;

  return (
    <div className="grid">
      <Card
        title={t("channels.title")}
        action={
          <button className="primary" onClick={() => setOpen(true)}>
            {t("channels.register")}
          </button>
        }
      >
        {Object.values(state.channels).length ? (
          Object.values(state.channels).map((c: any) => {
            const isEnabled = c.enabled !== false;
            const targetProject = c.projectId ? state.projects.find((p) => p.id === c.projectId) : null;
            const targetLabel = c.useOrchestrator
              ? t("channels.orchestrator")
              : targetProject
              ? t("channels.project", { name: `${targetProject.name} (${targetProject.path})` })
              : c.projectId
              ? t("channels.project", { name: c.projectId })
              : t("channels.orchestrator");

            const fullUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/${c.id}`;

            return (
              <article
                key={c.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: "8px",
                  marginBottom: "12px",
                  padding: "12px 14px",
                  background: isEnabled ? "#12141a" : "#0e0f14",
                  border: isEnabled ? "1px solid var(--border-dark)" : "1px dashed var(--border-mid)",
                  borderLeft: isEnabled ? "4px solid var(--amber)" : "4px solid var(--text-dim)",
                  borderRadius: "4px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        color: isEnabled ? "var(--led-green)" : "var(--text-dim)",
                        fontSize: "14px",
                      }}
                      title={isEnabled ? t("channels.enabled") : t("channels.disabled")}
                    >
                      {isEnabled ? "●" : "○"}
                    </span>
                    <b style={{ color: "var(--amber-bright)", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
                      {c.id}
                    </b>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        background: "#1c212e",
                        color: "var(--vfd-cyan)",
                        fontFamily: "var(--font-mono)",
                        border: "1px solid rgba(0, 240, 255, 0.3)",
                      }}
                    >
                      {c.type || "webhook"}
                    </span>
                  </div>

                  <div className="channel-card-actions">
                    <button
                      style={{ fontSize: "11px", padding: "3px 8px" }}
                      onClick={() => void copyEndpoint(c.id)}
                      title="Copy webhook ingress endpoint"
                    >
                      {t("channels.copyUrl")}
                    </button>
                    <button
                      style={{ fontSize: "11px", padding: "3px 8px" }}
                      onClick={() => void handleToggle(c.id)}
                      title="Toggle enable / disable"
                    >
                      {isEnabled ? "⏸ 停用" : "▶ 启用"}
                    </button>
                    <button
                      className="danger"
                      style={{ fontSize: "11px", padding: "3px 8px" }}
                      onClick={() => void handleDelete(c.id)}
                      title="Delete channel"
                    >
                      {t("channels.delete")}
                    </button>
                  </div>
                </div>

                <div className="channel-preview-box">
                  <code>POST {fullUrl}</code>
                  <button
                    style={{ fontSize: "10px", padding: "2px 6px", background: "#1c212e" }}
                    onClick={() => void copyEndpoint(c.id)}
                  >
                    📋
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                  <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>
                    {t("channels.target", {
                      target: targetLabel,
                      role: c.roleId ? `🎭 ${c.roleId}` : t("channels.default"),
                    })}
                  </p>
                  <small style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {c.tokenRef ? `🔐 鉴权: ${c.tokenRef}` : "🔓 无验证令牌"}
                  </small>
                </div>

                {c.outboundUrl ? (
                  <small style={{ color: "var(--amber-bright)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                    {t("channels.outbound", { url: c.outboundUrl })}
                  </small>
                ) : null}
              </article>
            );
          })
        ) : (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("channels.empty")}</p>
        )}
      </Card>

      <Card title={t("channels.queue")}>
        {state.deliveries.length ? (
          state.deliveries.map((d) => (
            <article key={d.id} style={{ marginBottom: "8px" }}>
              <b
                style={{
                  color: d.status === "delivered" ? "var(--led-green)" : "var(--amber)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {t("channels.delivery", { status: d.status.toUpperCase(), id: d.channelId })}
              </b>
              <p style={{ margin: "2px 0", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                {t("channels.attempts", { count: d.attempts })}
              </p>
              {d.lastError && (
                <small style={{ color: "var(--led-red)", fontFamily: "var(--font-mono)" }}>
                  {t("channels.error", { error: d.lastError })}
                </small>
              )}
            </article>
          ))
        ) : (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("channels.queueEmpty")}</p>
        )}
      </Card>

      {open && (
        <Modal title={t("channels.modal")} onClose={() => setOpen(false)}>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "14px" }}>
            {/* Quick Presets / Templates */}
            <div>
              <label style={{ marginBottom: "6px", display: "block" }}>
                <span style={{ color: "var(--amber-bright)", fontWeight: 700 }}>
                  {t("channels.presets")}
                </span>
              </label>
              <div className="channel-presets-list">
                {PRESETS.map((p) => {
                  const isSelected = activePreset === p.label;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      className={"channel-preset-btn " + (isSelected ? "active" : "")}
                      onClick={() => applyPreset(p)}
                    >
                      <span className="channel-preset-btn-title">
                        <span>{p.icon}</span>
                        <span>{p.label}</span>
                      </span>
                      <span className="channel-preset-btn-desc">{p.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row: Type & ID */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "12px" }}>
              <label>
                <span>{t("channels.typeField")}</span>
                <select
                  value={type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setType(newType);
                    if (id.endsWith("-webhook") || id.endsWith("-bot") || id.endsWith("-ingress")) {
                      setId(`${newType}-${newType === "webhook" ? "ingress" : "channel"}`);
                    }
                  }}
                >
                  <option value="webhook">🌐 webhook (通用 HTTP / CI / CD)</option>
                  <option value="telegram">✈️ telegram (Telegram Bot)</option>
                  <option value="slack">💬 slack (Slack 频道接入)</option>
                  <option value="discord">🎮 discord (Discord 机器人)</option>
                </select>
              </label>

              <label>
                <span>{t("channels.id")}</span>
                <input
                  type="text"
                  value={id}
                  placeholder="e.g. github-webhook"
                  onChange={(e) => setId(e.target.value)}
                  required
                />
              </label>
            </div>

            {/* Live Webhook Ingress URL Preview */}
            <div>
              <span style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {t("channels.previewUrl")}
              </span>
              <div className="channel-preview-box">
                <code>POST {fullPreviewUrl}</code>
                <button
                  type="button"
                  style={{ fontSize: "10px", padding: "2px 6px", background: "#1c212e" }}
                  onClick={() => {
                    void navigator.clipboard.writeText(fullPreviewUrl);
                    toast.success(t("channels.copied"));
                  }}
                  title="Copy URL"
                >
                  📋 复制
                </button>
              </div>
            </div>

            {/* Target Destination Dropdown (有得选!) */}
            <label>
              <span>{t("channels.targetField")}</span>
              <select
                value={targetMode}
                onChange={(e) => setTargetMode(e.target.value)}
              >
                <optgroup label="👑 全局控制平面 (Global Control Plane)">
                  <option value="orchestrator">
                    {t("channels.targetOrchestrator")}
                  </option>
                </optgroup>
                {state.projects.length > 0 && (
                  <optgroup label={`📁 项目工作区 (共 ${state.projects.length} 个已挂载项目)`}>
                    {state.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        📁 {p.name} — [{p.path}]
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <small style={{ color: "var(--text-dim)", font: "11px var(--font-mono)" }}>
                {targetMode === "orchestrator"
                  ? "入站消息将发送给全局中枢，支持跨多个项目自主编排与分析"
                  : "入站消息将直接派发给该项目的专属 Agent 独立处理"}
              </small>
            </label>

            {/* Role Dropdown (有得选!) */}
            <label>
              <span>{t("channels.roleField")}</span>
              <select
                value={roleId === "__custom__" ? "__custom__" : roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                <option value="">{t("channels.roleDefault")}</option>
                {Object.entries(state.roles || {}).map(([rKey, r]) => (
                  <option key={rKey} value={rKey}>
                    🎭 {r.label || r.id || rKey} {r.model ? `[${r.model}]` : ""} ({r.providerId})
                  </option>
                ))}
                <option value="__custom__">{t("channels.roleCustom")}</option>
              </select>

              {roleId === "__custom__" && (
                <input
                  type="text"
                  placeholder="输入自定义代理角色标识符，如 tester、auditor"
                  value={customRoleId}
                  onChange={(e) => setCustomRoleId(e.target.value)}
                  style={{ marginTop: "4px" }}
                  autoFocus
                />
              )}
            </label>

            {/* Token Reference */}
            <label>
              <span>{t("channels.token")}</span>
              <input
                type="text"
                value={tokenRef}
                placeholder="e.g. env:WEBHOOK_SECRET 或 secret:my_token"
                onChange={(e) => setTokenRef(e.target.value)}
              />
              <div className="channel-chip-row">
                <span style={{ fontSize: "10px", color: "var(--text-dim)", alignSelf: "center" }}>快捷填充:</span>
                {["env:WEBHOOK_SECRET", "env:GITHUB_WEBHOOK_SECRET", "env:TELEGRAM_BOT_TOKEN", "env:SLACK_SIGNING_SECRET"].map((chip) => (
                  <span
                    key={chip}
                    className="channel-chip-item"
                    onClick={() => setTokenRef(chip)}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </label>

            {/* Outbound Callback URL */}
            <label>
              <span>{t("channels.callback")}</span>
              <input
                type="text"
                value={outboundUrl}
                placeholder="https://my-domain.com/api/corvus-callback"
                onChange={(e) => setOutboundUrl(e.target.value)}
              />
            </label>

            {/* Modal Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
              <button type="button" onClick={() => setOpen(false)}>
                {t("channels.cancel")}
              </button>
              <button type="submit" className="primary" disabled={submitting}>
                {submitting ? "提交中..." : t("channels.submit")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
