import React, { useMemo, useState } from "react";
import { Card } from "../components";
import { eventUrl } from "../api";
import type { PageProps } from "./shared";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "timeline.filterPlaceholder": { en: "Filter events / payload JSON...", "zh-CN": "筛选事件或负载 JSON……" },
  "timeline.allTypes": { en: "ALL EVENT TYPES", "zh-CN": "所有事件类型" },
  "timeline.export": { en: "EXPORT AUDIT LOG ↓", "zh-CN": "导出审计日志 ↓" },
  "timeline.logTitle": { en: "Timeline Event Log ({count})", "zh-CN": "时间线事件日志（{count}）" },
  "timeline.run": { en: "RUN: {id}", "zh-CN": "运行：{id}" },
  "timeline.noEvents": { en: "No matching events found.", "zh-CN": "未找到匹配的事件。" },
  "timeline.artifactsTitle": { en: "Artifacts & Evidence Store ({count})", "zh-CN": "产物与证据库（{count}）" },
  "timeline.noArtifacts": { en: "No artifacts recorded yet.", "zh-CN": "尚未记录任何产物。" },
});

export function TimelinePage({ state }: PageProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const types = Array.from(new Set(state.timeline.map((event) => event.type))).sort();

  const events = useMemo(
    () =>
      state.timeline.filter(
        (event) =>
          (type === "all" || event.type === type) &&
          (!query || JSON.stringify(event).toLowerCase().includes(query.toLowerCase()))
      ),
    [state.timeline, type, query]
  );

  return (
    <>
      <div className="memory-toolbar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("timeline.filterPlaceholder")}
          style={{ width: "260px" }}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">{t("timeline.allTypes")}</option>
          {types.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <button className="primary" onClick={() => location.assign(eventUrl("/api/audit/export"))}>
          {t("timeline.export")}
        </button>
      </div>

      <div className="grid">
        <Card title={t("timeline.logTitle", { count: events.length })}>
          {events.length ? (
            events.map((event) => (
              <details
                key={event.id}
                style={{
                  border: "1px solid var(--border-dark)",
                  borderRadius: "4px",
                  background: "#121418",
                  padding: "8px 12px",
                  marginBottom: "8px",
                }}
              >
                <summary style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--amber)" }}>
                  <b>◆ {event.type}</b> · <span style={{ color: "var(--text-dim)" }}>{event.createdAt}</span>
                  {event.runId && <span style={{ color: "var(--vfd-cyan)", marginLeft: "8px" }}>{t("timeline.run", { id: event.runId })}</span>}
                </summary>
                <pre style={{ marginTop: "8px", background: "#090a0d" }}>{JSON.stringify(event, null, 2)}</pre>
              </details>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("timeline.noEvents")}</p>
          )}
        </Card>

        <Card title={t("timeline.artifactsTitle", { count: state.artifacts.length })}>
          {state.artifacts.length ? (
            state.artifacts.map((artifact) => (
              <details
                key={artifact.id}
                style={{
                  border: "1px solid var(--border-dark)",
                  borderRadius: "4px",
                  background: "#121418",
                  padding: "8px 12px",
                  marginBottom: "8px",
                }}
              >
                <summary style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--vfd-cyan)" }}>
                  <b>📄 {artifact.title}</b>
                </summary>
                <p style={{ fontSize: "13px", color: "var(--text-main)", marginTop: "6px", lineHeight: "1.5" }}>
                  {artifact.summary}
                </p>
              </details>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("timeline.noArtifacts")}</p>
          )}
        </Card>
      </div>
    </>
  );
}
