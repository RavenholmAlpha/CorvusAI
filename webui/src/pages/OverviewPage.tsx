import React from "react";
import { Card, Metric } from "../components";
import type { PageProps } from "./shared";

export function OverviewPage({ state }: PageProps) {
  const activeTasks = state.tasks.filter((t) => t.status === "running").length;

  return (
    <div className="grid">
      <Metric label="Registered Workspaces" value={state.projects.length} />
      <Metric label="Active Tasks" value={activeTasks} />
      <Metric label="Pending Approvals" value={state.approvals.length} />
      <Metric label="Memories Retained" value={state.memories.length} />
      <Metric label="Inference Requests" value={state.usage.requests} />
      <Metric label="Prompt Tokens" value={state.usage.promptTokens.toLocaleString()} />
      <Metric label="Completion Tokens" value={state.usage.completionTokens.toLocaleString()} />
      <Metric label="Installed Skills" value={state.skills.length} />

      <Card title="Recent Activity Reel">
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
                  {e.createdAt} {e.runId && `· Run: ${e.runId}`}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>No timeline logs recorded yet.</p>
        )}
      </Card>

      <Card title="Deck Diagnostics & System Integrity">
        {state.diagnostics.length ? (
          state.diagnostics.map((d) => (
            <p key={d.path} className={d.level} style={{ margin: "4px 0", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
              [{d.level.toUpperCase()}] {d.path}: {d.message}
            </p>
          ))
        ) : (
          <p className="ok" style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
            ✓ ALL SUBSYSTEMS NOMINAL (INTEGRITY OK)
          </p>
        )}
      </Card>
    </div>
  );
}