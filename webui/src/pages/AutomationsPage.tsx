import React, { useState } from "react";
import { Card, Modal, SimpleForm, toast } from "../components";
import { postJson } from "../api";
import type { PageProps } from "./shared";

export function AutomationsPage({ state, reload }: PageProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="grid">
        <Card
          title="Scheduled Automations & Triggers"
          action={
            <button className="primary" onClick={() => setOpen(true)}>
              ＋ ADD AUTOMATION
            </button>
          }
        >
          {Object.values(state.automations).length ? (
            Object.values(state.automations).map((a: any) => (
              <article key={a.id} style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "8px", marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ color: a.enabled !== false ? "var(--amber)" : "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {a.enabled !== false ? "● " : "○ "}
                    {a.label || a.id}
                  </b>
                  <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--vfd-cyan)" }}>
                    {a.trigger?.type === "interval"
                      ? `EVERY ${a.trigger.everySeconds}s`
                      : a.trigger?.type || "interval"}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  Workspace: {a.projectId} {a.roleId && `· Role: ${a.roleId}`}
                </p>
                <pre style={{ margin: 0, fontSize: "12px", background: "#0a0b0d" }}>{a.prompt}</pre>
                <small style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  Status: {JSON.stringify(state.automationStates.find((status) => status.id === a.id) ?? {})}
                </small>
              </article>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>No automated recurring tasks scheduled.</p>
          )}
        </Card>
      </div>

      {open && (
        <Modal title="Schedule Automation Task" onClose={() => setOpen(false)}>
          <SimpleForm
            fields={[
              { name: "id", label: "Automation Identifier", placeholder: "e.g. daily-code-health" },
              { name: "projectId", label: "Project Workspace ID", placeholder: state.activeProjectId || "" },
              { name: "roleId", label: "Agent Role ID (Optional)", placeholder: "reviewer" },
              { name: "everySeconds", label: "Interval in Seconds", placeholder: "3600" },
              { name: "prompt", label: "Prompt / Instructions for Task", placeholder: "Run audit and report diagnostics" },
            ]}
            onSubmit={async (v) => {
              try {
                await postJson("/api/automations", v);
                setOpen(false);
                await reload();
                toast.success("Automation scheduled.");
              } catch (e) {
                toast.error("Failed to add automation: " + String(e));
              }
            }}
          />
        </Modal>
      )}
    </>
  );
}