import React from "react";
import { postJson } from "../api";
import type { PageProps } from "./shared";
import { toast } from "../components";

export function TasksPage({ state, reload }: PageProps) {
  const cancel = async (id: string) => {
    try {
      await postJson("/api/tasks/" + id + "/cancel");
      await reload();
      toast.info("Task canceled.");
    } catch (e) {
      toast.error("Failed to cancel task: " + String(e));
    }
  };

  return (
    <div className="list">
      {state.tasks.length ? (
        state.tasks.map((t) => {
          const isRunning = t.status === "running";
          return (
            <article key={t.id} style={{ borderLeft: isRunning ? "4px solid var(--amber)" : "4px solid var(--border-mid)" }}>
              <div>
                <b style={{ color: isRunning ? "var(--amber)" : "var(--text-main)", fontFamily: "var(--font-mono)" }}>
                  [{t.status.toUpperCase()}] {t.description || t.prompt}
                </b>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Role: {t.modelProfile || "default"} · Recursion Depth: {t.depth} · Task ID: {t.id}
                </p>
              </div>
              {isRunning && (
                <button className="danger" onClick={() => void cancel(t.id)}>
                  CANCEL TASK ■
                </button>
              )}
            </article>
          );
        })
      ) : (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          NO BACKGROUND SUBAGENT TASKS ACTIVE
        </div>
      )}
    </div>
  );
}