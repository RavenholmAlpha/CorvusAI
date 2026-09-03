import React, { useState } from "react";
import { Card, Modal, toast } from "../components";
import { postJson, deleteJson } from "../api";
import { defineTranslations, useI18n } from "../i18n";
import type { PageProps } from "./shared";

defineTranslations({
  "automations.title": { en: "Scheduled Automations & Triggers", "zh-CN": "定时自动化与触发器" },
  "automations.add": { en: "＋ ADD AUTOMATION", "zh-CN": "＋ 安排自动化任务" },
  "automations.empty": { en: "No automated recurring tasks scheduled. Click 'ADD AUTOMATION' to create one using templates.", "zh-CN": "尚未安排自动重复任务。点击右上角“安排自动化任务”，即可选用预设模板一键创建。" },
  "automations.modalTitle": { en: "Schedule Automation Task (安排自动化任务)", "zh-CN": "安排自动化任务" },
  "automations.templates": { en: "Quick Task Templates (Click to Autofill)", "zh-CN": "💡 快捷任务模板 (点击即可一键填入)" },
  "automations.taskName": { en: "Automation Name", "zh-CN": "任务名称" },
  "automations.projectLabel": { en: "Target Workspace", "zh-CN": "目标工作区" },
  "automations.roleLabel": { en: "Agent Role", "zh-CN": "执行智能体角色" },
  "automations.triggerType": { en: "Trigger Mode", "zh-CN": "触发模式" },
  "automations.intervalMode": { en: "Interval Schedule", "zh-CN": "⏱️ 定时循环" },
  "automations.eventMode": { en: "Event Trigger", "zh-CN": "🔔 事件触发" },
  "automations.frequency": { en: "Execution Frequency", "zh-CN": "执行频率 / 周期" },
  "automations.eventSelect": { en: "Triggering Event", "zh-CN": "触发事件" },
  "automations.promptLabel": { en: "Task Prompt / Instructions", "zh-CN": "任务提示词 / 执行指令" },
  "automations.cancel": { en: "Cancel", "zh-CN": "取消" },
  "automations.submit": { en: "Schedule Task (保存并启动)", "zh-CN": "保存并启动自动化" },
  "automations.runNow": { en: "▶ Run Now", "zh-CN": "▶ 立即执行" },
  "automations.pause": { en: "⏸ Pause", "zh-CN": "⏸ 暂停" },
  "automations.resume": { en: "▶ Resume", "zh-CN": "▶ 启用" },
  "automations.delete": { en: "🗑 Delete", "zh-CN": "🗑 删除" },
  "automations.running": { en: "Triggering...", "zh-CN": "正在触发..." },
  "automations.triggered": { en: "Automation run triggered successfully.", "zh-CN": "已成功触发立即执行！" },
  "automations.deleted": { en: "Automation deleted.", "zh-CN": "自动化任务已删除。" },
  "automations.created": { en: "Automation scheduled successfully.", "zh-CN": "自动化任务已安排！" },
  "automations.failed": { en: "Operation failed: {error}", "zh-CN": "操作失败：{error}" },
});

interface AutomationTemplate {
  icon: string;
  name: string;
  desc: string;
  roleId: string;
  everySeconds: number;
  prompt: string;
}

const TEMPLATES: AutomationTemplate[] = [
  {
    icon: "🏥",
    name: "代码健康巡检",
    desc: "扫描未解决 TODO、弃用 API、潜在 Bug 并出具简报",
    roleId: "reviewer",
    everySeconds: 21600, // 6h
    prompt: "对当前工作区代码进行全面健康检查，扫描未解决的 TODO 标记、弃用的 API 调用、语法隐患与潜在代码坏味道，并输出一份条理清晰的巡检简报。",
  },
  {
    icon: "🛡️",
    name: "安全与依赖审计",
    desc: "审查 npm/pip 依赖漏洞、敏感配置与过期包",
    roleId: "tester",
    everySeconds: 86400, // 24h
    prompt: "检查项目当前所有依赖项的安全通告，扫描是否存在已知 CVE 漏洞或严重过期的依赖库，提供升级防护建议与安全修复步骤。",
  },
  {
    icon: "🧪",
    name: "自动化测试与构建",
    desc: "定时运行测试套件与代码构建，监控回归故障",
    roleId: "tester",
    everySeconds: 3600, // 1h
    prompt: "在当前工作区执行自动化测试套件与编译构建，若测试失败或存在报错，详细定位失败的用例与根因，并给出针对性的修复方案。",
  },
  {
    icon: "📝",
    name: "每日进度工作汇总",
    desc: "汇总近期代码提交与任务执行记录，生成工作简报",
    roleId: "architect",
    everySeconds: 86400, // 24h
    prompt: "汇总分析过去 24 小时工作区的代码提交记录、修改的文件列表以及执行完成的智能体任务，整理生成一份结构化的工作简报。",
  },
  {
    icon: "🧹",
    name: "代码规范与格式清理",
    desc: "检查格式规范，清理冗余注释与无用引用",
    roleId: "coder",
    everySeconds: 43200, // 12h
    prompt: "检查项目代码的 ESLint/Prettier 规范合规性，清理未引用的废弃变量和冗余注释，确保代码风格统一规范。",
  },
];

const PRESETS = [
  { label: "每 15 分钟", seconds: 900 },
  { label: "每 30 分钟", seconds: 1800 },
  { label: "每 1 小时", seconds: 3600 },
  { label: "每 6 小时", seconds: 21600 },
  { label: "每 12 小时", seconds: 43200 },
  { label: "每天一次", seconds: 86400 },
  { label: "每周一次", seconds: 604800 },
];

function formatFrequency(trigger: any): string {
  if (!trigger) return "未指定";
  if (trigger.type === "event") {
    const ev = trigger.event || "task.completed";
    return `🔔 事件触发: ${ev}`;
  }
  const s = trigger.everySeconds || 3600;
  if (s === 900) return "⏱️ 每 15 分钟";
  if (s === 1800) return "⏱️ 每 30 分钟";
  if (s === 3600) return "⏱️ 每 1 小时";
  if (s === 21600) return "⏱️ 每 6 小时";
  if (s === 43200) return "⏱️ 每 12 小时";
  if (s === 86400) return "📅 每天一次 (24h)";
  if (s === 604800) return "📅 每周一次 (7天)";
  if (s % 86400 === 0) return `📅 每 ${s / 86400} 天`;
  if (s % 3600 === 0) return `⏱️ 每 ${s / 3600} 小时`;
  if (s % 60 === 0) return `⏱️ 每 ${s / 60} 分钟`;
  return `⏱️ 每 ${s} 秒`;
}

export function AutomationsPage({ state, reload }: PageProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [activeTemplateIdx, setActiveTemplateIdx] = useState<number | null>(null);

  // Form states
  const [taskName, setTaskName] = useState("");
  const [projectId, setProjectId] = useState(state.activeProjectId || state.projects[0]?.id || "");
  const [roleId, setRoleId] = useState("");
  const [triggerType, setTriggerType] = useState<"interval" | "event">("interval");
  const [everySeconds, setEverySeconds] = useState(3600);
  const [eventName, setEventName] = useState("task.completed");
  const [prompt, setPrompt] = useState("");
  const [customValue, setCustomValue] = useState(1);
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [isCustomSeconds, setIsCustomSeconds] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal opens
  const handleOpenModal = () => {
    setActiveTemplateIdx(null);
    setTaskName("定时代码健康检查");
    setProjectId(state.activeProjectId || state.projects[0]?.id || "");
    setRoleId("reviewer");
    setTriggerType("interval");
    setEverySeconds(3600);
    setEventName("task.completed");
    setPrompt("对当前工作区代码进行全面健康检查，扫描未解决的 TODO 标记与潜在隐患，并输出检查简报。");
    setIsCustomSeconds(false);
    setOpen(true);
  };

  const handleApplyTemplate = (tmpl: AutomationTemplate, idx: number) => {
    setActiveTemplateIdx(idx);
    setTaskName(tmpl.name);
    setPrompt(tmpl.prompt);
    setRoleId(tmpl.roleId);
    setEverySeconds(tmpl.everySeconds);
    setIsCustomSeconds(false);
    setTriggerType("interval");
  };

  const handleCustomChange = (val: number, unit: "minutes" | "hours" | "days") => {
    setCustomValue(val);
    setCustomUnit(unit);
    setIsCustomSeconds(true);
    const multiplier = unit === "minutes" ? 60 : unit === "hours" ? 3600 : 86400;
    setEverySeconds(Math.max(1, val) * multiplier);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim() || !projectId || !prompt.trim()) {
      toast.error("请填写任务名称、选择工作区并填写执行指令");
      return;
    }
    setSubmitting(true);
    try {
      const generatedId = "auto_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
      await postJson("/api/automations", {
        id: generatedId,
        label: taskName.trim(),
        projectId,
        roleId: roleId || undefined,
        prompt: prompt.trim(),
        ...(triggerType === "event" ? { event: eventName } : { everySeconds }),
      });
      setOpen(false);
      await reload();
      toast.success(t("automations.created"));
    } catch (err) {
      toast.error(t("automations.failed", { error: String(err) }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunNow = async (id: string, name: string) => {
    try {
      toast.info(`正在触发执行任务 [${name}]...`);
      await postJson(`/api/automations/${encodeURIComponent(id)}/run`);
      toast.success(t("automations.triggered"));
      await reload();
    } catch (e) {
      toast.error(t("automations.failed", { error: String(e) }));
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await postJson(`/api/automations/${encodeURIComponent(id)}/toggle`);
      await reload();
      toast.info("已切换自动化任务状态");
    } catch (e) {
      toast.error(t("automations.failed", { error: String(e) }));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除自动化任务 "${name}" 吗？`)) return;
    try {
      await deleteJson(`/api/automations/${encodeURIComponent(id)}`);
      await reload();
      toast.success(t("automations.deleted"));
    } catch (e) {
      toast.error(t("automations.failed", { error: String(e) }));
    }
  };

  const automationsList = Object.values(state.automations || {});

  return (
    <>
      <div className="grid">
        <Card
          title={t("automations.title")}
          action={
            <button className="primary" onClick={handleOpenModal}>
              {t("automations.add")}
            </button>
          }
        >
          {automationsList.length ? (
            automationsList.map((a: any) => {
              const proj = state.projects.find((p) => p.id === a.projectId);
              const roleObj = a.roleId ? state.roles[a.roleId] : undefined;
              const autoState = state.automationStates.find((s) => s.id === a.id);
              const isEnabled = a.enabled !== false;

              return (
                <article
                  key={a.id}
                  className={`automation-article-card ${isEnabled ? "active" : "paused"}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: isEnabled ? "var(--led-green)" : "var(--border-light)",
                          boxShadow: isEnabled ? "0 0 6px var(--led-green)" : "none",
                        }}
                      />
                      <b style={{ color: isEnabled ? "var(--amber)" : "var(--text-dim)", fontSize: "14px", fontFamily: "var(--font-mono)" }}>
                        {a.label || a.id}
                      </b>
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "1px 6px",
                          borderRadius: "2px",
                          background: isEnabled ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
                          color: isEnabled ? "var(--led-green)" : "var(--text-dim)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {isEnabled ? "RUNNING" : "PAUSED"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => void handleRunNow(a.id, a.label || a.id)}
                        title="立即在后台执行一次该任务"
                      >
                        {t("automations.runNow")}
                      </button>
                      <button
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => void handleToggle(a.id)}
                        title={isEnabled ? "暂停此任务" : "恢复此任务"}
                      >
                        {isEnabled ? t("automations.pause") : t("automations.resume")}
                      </button>
                      <button
                        style={{ fontSize: "11px", padding: "3px 8px", color: "#ff8080", borderColor: "rgba(255, 100, 100, 0.3)" }}
                        onClick={() => void handleDelete(a.id, a.label || a.id)}
                        title="删除该自动化任务"
                      >
                        {t("automations.delete")}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    <span>📂 目标工作区: <b style={{ color: "var(--vfd-cyan)" }}>{proj ? `${proj.name} (${proj.path})` : a.projectId}</b></span>
                    <span>⏱️ 执行周期: <b style={{ color: "var(--amber-bright)" }}>{formatFrequency(a.trigger)}</b></span>
                    <span>🤖 智能体角色: <b style={{ color: "var(--text-main)" }}>{roleObj ? `${roleObj.label || roleObj.id} (${roleObj.id})` : "默认项目智能体"}</b></span>
                  </div>

                  <div style={{ background: "#0b0c10", padding: "8px 10px", borderRadius: "3px", border: "1px solid var(--border-dark)" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginBottom: "3px" }}>执行指令 (PROMPT):</div>
                    <pre style={{ margin: 0, fontSize: "12px", color: "var(--tape-cream)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {a.prompt}
                    </pre>
                  </div>

                  {autoState && (
                    <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)", display: "flex", gap: "12px", alignItems: "center" }}>
                      <span>
                        上次运行:{" "}
                        <b style={{ color: autoState.lastStatus === "succeeded" ? "var(--led-green)" : autoState.lastStatus === "failed" ? "var(--led-red)" : "var(--amber)" }}>
                          {(autoState.lastStatus || "IDLE").toUpperCase()}
                        </b>
                      </span>
                      {autoState.lastRunAt && <span>运行时间: {new Date(autoState.lastRunAt).toLocaleTimeString()}</span>}
                      {autoState.lastError && <span style={{ color: "var(--led-red)" }}>错误: {autoState.lastError}</span>}
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>⏰</div>
              <p style={{ margin: 0 }}>{t("automations.empty")}</p>
            </div>
          )}
        </Card>
      </div>

      {/* Redesigned Visual Schedule Task Modal */}
      {open && (
        <Modal title={t("automations.modalTitle")} onClose={() => setOpen(false)}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Quick Templates Selector */}
            <div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--amber)", display: "block", marginBottom: "6px" }}>
                {t("automations.templates")}
              </span>
              <div className="automation-template-grid">
                {TEMPLATES.map((tmpl, idx) => (
                  <div
                    key={tmpl.name}
                    className={`automation-template-card ${activeTemplateIdx === idx ? "active" : ""}`}
                    onClick={() => handleApplyTemplate(tmpl, idx)}
                  >
                    <span className="automation-template-icon">{tmpl.icon}</span>
                    <div>
                      <span className="automation-template-label">{tmpl.name}</span>
                      <span className="automation-template-desc">{tmpl.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Task Name */}
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600 }}>{t("automations.taskName")}:</span>
              <input
                type="text"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="例如: 每日代码健康巡检"
                required
              />
            </label>

            {/* Workspace & Role Selectors (2 Columns) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>{t("automations.projectLabel")}:</span>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  style={{ width: "100%" }}
                  required
                >
                  {state.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      📂 {p.name} ({p.path})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>{t("automations.roleLabel")}:</span>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">🤖 默认项目智能体 (Default Agent)</option>
                  {Object.values(state.roles || {}).map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.id === "reviewer" ? "🔍" : r.id === "tester" ? "🧪" : r.id === "coder" ? "💻" : r.id === "architect" ? "📐" : "⚡"}{" "}
                      {r.label || r.id} ({r.id})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Trigger Mode Segmented Tabs */}
            <div>
              <span style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                {t("automations.triggerType")}:
              </span>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <button
                  type="button"
                  className={triggerType === "interval" ? "primary" : ""}
                  style={{ flex: 1, padding: "6px 12px", fontSize: "12px" }}
                  onClick={() => setTriggerType("interval")}
                >
                  {t("automations.intervalMode")}
                </button>
                <button
                  type="button"
                  className={triggerType === "event" ? "primary" : ""}
                  style={{ flex: 1, padding: "6px 12px", fontSize: "12px" }}
                  onClick={() => setTriggerType("event")}
                >
                  {t("automations.eventMode")}
                </button>
              </div>

              {triggerType === "interval" ? (
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    {t("automations.frequency")}:
                  </span>
                  <div className="freq-pills">
                    {PRESETS.map((p) => (
                      <button
                        key={p.seconds}
                        type="button"
                        className={`freq-pill ${!isCustomSeconds && everySeconds === p.seconds ? "active" : ""}`}
                        onClick={() => {
                          setIsCustomSeconds(false);
                          setEverySeconds(p.seconds);
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`freq-pill ${isCustomSeconds ? "active" : ""}`}
                      onClick={() => setIsCustomSeconds(true)}
                    >
                      ⚙️ 自定义间隔
                    </button>
                  </div>

                  {isCustomSeconds && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>每隔:</span>
                      <input
                        type="number"
                        min="1"
                        style={{ width: "80px" }}
                        value={customValue}
                        onChange={(e) => handleCustomChange(Number(e.target.value) || 1, customUnit)}
                      />
                      <select
                        value={customUnit}
                        onChange={(e) => handleCustomChange(customValue, e.target.value as any)}
                        style={{ width: "100px" }}
                      >
                        <option value="minutes">分钟</option>
                        <option value="hours">小时</option>
                        <option value="days">天</option>
                      </select>
                      <span style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                        (= {everySeconds} 秒)
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{t("automations.eventSelect")}:</span>
                  <select
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="task.completed">🔔 task.completed (子任务完成时自动触发)</option>
                    <option value="build.succeeded">🔔 build.succeeded (构建成功时自动触发)</option>
                    <option value="approval.granted">🔔 approval.granted (工具审批通过后自动触发)</option>
                    <option value="channel.message">🔔 channel.message (收到外部通道消息时触发)</option>
                  </select>
                </label>
              )}
            </div>

            {/* Task Prompt Instructions */}
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600 }}>{t("automations.promptLabel")}:</span>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="详细描述智能体执行此自动化任务时要完成的工作..."
                required
              />
            </label>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <button type="button" onClick={() => setOpen(false)}>
                {t("automations.cancel")}
              </button>
              <button type="submit" className="primary" disabled={submitting}>
                {submitting ? "正在保存..." : t("automations.submit")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
