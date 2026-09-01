import React from "react";
import { Card, Metric } from "../components";
import type { PageProps } from "./shared";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "overview.registeredWorkspaces": { en: "Registered Workspaces", "zh-CN": "已登记工作区" },
  "overview.activeTasks": { en: "Active Tasks", "zh-CN": "活跃任务" },
  "overview.pendingApprovals": { en: "Pending Approvals", "zh-CN": "待处理审批" },
  "overview.memoriesRetained": { en: "Memories Retained", "zh-CN": "保留记忆" },
  "overview.inferenceRequests": { en: "Inference Requests", "zh-CN": "推理请求" },
  "overview.promptTokens": { en: "Prompt Tokens", "zh-CN": "提示词令牌" },
  "overview.completionTokens": { en: "Completion Tokens", "zh-CN": "补全令牌" },
  "overview.installedSkills": { en: "Installed Skills", "zh-CN": "已安装技能" },
  "overview.recentActivity": { en: "Recent Activity Reel", "zh-CN": "近期活动记录" },
  "overview.run": { en: "Run: {id}", "zh-CN": "运行：{id}" },
  "overview.noTimeline": { en: "No timeline logs recorded yet.", "zh-CN": "尚未记录时间线日志。" },
  "overview.diagnostics": { en: "Deck Diagnostics & System Integrity", "zh-CN": "卡座诊断与系统完整性" },
  "overview.nominal": { en: "✓ ALL SUBSYSTEMS NOMINAL (INTEGRITY OK)", "zh-CN": "✓ 所有子系统运行正常（完整性良好）" },
});

export function OverviewPage({ state }: PageProps) {
  const { locale, t } = useI18n();
  const activeTasks = state.tasks.filter((t) => t.status === "running").length;

  return (
    <div className="grid">
      <Metric label={t("overview.registeredWorkspaces")} value={state.projects.length} />
      <Metric label={t("overview.activeTasks")} value={activeTasks} />
      <Metric label={t("overview.pendingApprovals")} value={state.approvals.length} />
      <Metric label={t("overview.memoriesRetained")} value={state.memories.length} />
      <Metric label={t("overview.inferenceRequests")} value={state.usage.requests} />
      <Metric label={t("overview.promptTokens")} value={state.usage.promptTokens.toLocaleString(locale)} />
      <Metric label={t("overview.completionTokens")} value={state.usage.completionTokens.toLocaleString(locale)} />
      <Metric label={t("overview.installedSkills")} value={state.skills.length} />

      <Card title={t("overview.recentActivity")}>
        {state.timeline.length ? (
          state.timeline.slice(0, 8).map((e) => (
            <div
              key={e.id}
              style={{
                borderBottom: "1px dashed var(--border-dark)",
                padding: "8px 0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <b style={{ color: "var(--amber)", fontFamily: "var(--font-mono)", fontSize: "13px" }}>
                  ◆ {e.type}
                </b>
                <div style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "11px", marginTop: "2px" }}>
                  {e.createdAt} {e.runId && `· ${t("overview.run", { id: e.runId })}`}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("overview.noTimeline")}</p>
        )}
      </Card>

      <Card title={t("overview.diagnostics")}>
        {state.diagnostics.length ? (
          state.diagnostics.map((d) => (
            <p key={d.path} className={d.level} style={{ margin: "4px 0", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
              [{d.level.toUpperCase()}] {d.path}: {d.message}
            </p>
          ))
        ) : (
          <p className="ok" style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
            {t("overview.nominal")}
          </p>
        )}
      </Card>
    </div>
  );
}