import React, { useState } from "react";
import { Card, Modal, SimpleForm, toast } from "../components";
import { postJson } from "../api";
import type { PageProps } from "./shared";

export function RoutingPage({ state, reload }: PageProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="grid">
        <Card
          title="Global Intent Routing Rules"
          action={
            <button className="primary" onClick={() => setOpen(true)}>
              ＋ ADD ROUTING RULE
            </button>
          }
        >
          {Object.values(state.routingRules).length ? (
            Object.values(state.routingRules).map((r: any) => (
              <article key={r.id} style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "6px", marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>{r.id}</b>
                  <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--vfd-cyan)" }}>
                    PRIORITY: {r.priority ?? 0}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  Keywords: <code style={{ color: "var(--tape-cream)" }}>{(r.keywords || []).join(", ") || "any"}</code>
                </p>
                <p style={{ margin: 0, fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                  Targets: {(r.projectIds || []).join(", ") || "All projects"} · Role: {r.roleId || "project default"}
                </p>
              </article>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>No dynamic keyword routing rules registered.</p>
          )}
        </Card>
      </div>

      {open && (
        <Modal title="Add Intent Routing Rule" onClose={() => setOpen(false)}>
          <SimpleForm
            fields={[
              { name: "id", label: "Rule Identifier", placeholder: "e.g. frontend-queries" },
              { name: "keywords", label: "Trigger Keywords (comma-separated)", placeholder: "react, vite, css, ui" },
              { name: "projectIds", label: "Target Project IDs (comma-separated)", placeholder: state.activeProjectId || "" },
              { name: "roleId", label: "Target Agent Role ID (Optional)", placeholder: "coder" },
              { name: "priority", label: "Rule Priority (Integer)", placeholder: "10" },
            ]}
            onSubmit={async (v) => {
              try {
                await postJson("/api/routing", v);
                setOpen(false);
                await reload();
                toast.success("Routing rule added.");
              } catch (e) {
                toast.error("Failed to add route: " + String(e));
              }
            }}
          />
        </Modal>
      )}
    </>
  );
}