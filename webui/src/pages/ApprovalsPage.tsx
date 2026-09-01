import React from "react";
import { postJson } from "../api";
import type { PageProps } from "./shared";
import { toast } from "../components";

export function ApprovalsPage({ state, reload }: PageProps) {
  const resolve = async (id: string, decision: "allow" | "deny") => {
    try {
      await postJson("/api/approvals/" + id, { decision });
      await reload();
      toast.success(decision === "allow" ? "Approved tool execution." : "Blocked tool execution.");
    } catch (e) {
      toast.error("Failed to resolve approval: " + String(e));
    }
  };

  return (
    <div className="list">
      {state.approvals.length ? (
        state.approvals.map((a) => (
          <article key={a.id} style={{ borderLeft: "4px solid var(--amber)", display: "flex", flexDirection: "column", gap: "12px", alignItems: "stretch" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <b style={{ color: "var(--amber)", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
                  ⚠ [AUTHORIZATION REQUIRED] {a.toolName || "Tool Execution"}
                </b>
                <p style={{ margin: "2px 0 0", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>
                  Run ID: {a.runId} · Capability: {a.toolCall?.capability || "standard"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="primary" onClick={() => void resolve(a.id, "allow")}>
                  AUTHORIZE ONCE ✓
                </button>
                <button className="danger" onClick={() => void resolve(a.id, "deny")}>
                  REJECT ✕
                </button>
              </div>
            </div>

            <div>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                PROPOSED ARGUMENTS:
              </span>
              <pre>{JSON.stringify(a.toolCall?.arguments ?? {}, null, 2)}</pre>
            </div>
          </article>
        ))
      ) : (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          <span style={{ color: "var(--led-green)", fontSize: "20px", display: "block", marginBottom: "8px" }}>✓</span>
          NO PENDING HUMAN-IN-THE-LOOP APPROVAL REQUESTS
        </div>
      )}
    </div>
  );
}