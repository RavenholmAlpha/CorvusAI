import React, { useState } from "react";
import { Card, Modal, SimpleForm, toast } from "../components";
import { postJson } from "../api";
import type { PageProps } from "./shared";

export function ChannelsPage({ state, reload }: PageProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid">
      <Card
        title="Webhook Ingress Channels"
        action={
          <button className="primary" onClick={() => setOpen(true)}>
            ＋ REGISTER CHANNEL
          </button>
        }
      >
        {Object.values(state.channels).length ? (
          Object.values(state.channels).map((channel: any) => (
            <article key={channel.id} style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "6px", marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>
                  {channel.enabled !== false ? "● " : "○ "}
                  {channel.id}
                </b>
                <span style={{ fontSize: "11px", color: "var(--vfd-cyan)", fontFamily: "var(--font-mono)" }}>
                  TYPE: {channel.type || "webhook"}
                </span>
              </div>
              <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>
                ENDPOINT: <code style={{ color: "var(--amber-bright)" }}>POST /api/webhooks/{channel.id}</code>
              </p>
              <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-dim)" }}>
                Target: {channel.useOrchestrator ? "Global Orchestrator" : `Project ${channel.projectId}`} · Role: {channel.roleId || "default"}
              </p>
              <small style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {channel.outboundUrl ? `Outbound: ${channel.outboundUrl}` : "No outbound callback registered"}
              </small>
            </article>
          ))
        ) : (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>No inbound webhook channels configured.</p>
        )}
      </Card>

      <Card title="Outbound Delivery Queue">
        {state.deliveries.length ? (
          state.deliveries.map((delivery) => (
            <article key={delivery.id} style={{ marginBottom: "8px" }}>
              <div>
                <b style={{ color: delivery.status === "delivered" ? "var(--led-green)" : "var(--amber)", fontFamily: "var(--font-mono)" }}>
                  [{delivery.status.toUpperCase()}] Channel: {delivery.channelId}
                </b>
                <p style={{ margin: "2px 0", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  Attempts: {delivery.attempts}
                </p>
                {delivery.lastError && (
                  <small style={{ color: "var(--led-red)", fontFamily: "var(--font-mono)" }}>
                    Error: {delivery.lastError}
                  </small>
                )}
              </div>
            </article>
          ))
        ) : (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>Outbound delivery queue is empty.</p>
        )}
      </Card>

      {open && (
        <Modal title="Register Webhook Channel" onClose={() => setOpen(false)}>
          <SimpleForm
            fields={[
              { name: "id", label: "Channel Identifier (e.g. ci-cd, telegram)", placeholder: "github-webhook" },
              { name: "type", label: "Channel Type (webhook, telegram, slack, discord)", placeholder: "webhook" },
              { name: "projectId", label: "Target Project Workspace ID", placeholder: state.activeProjectId || "" },
              { name: "roleId", label: "Agent Role ID (Optional)", placeholder: "reviewer" },
              { name: "tokenRef", label: "Authorization Token Ref", placeholder: "env:WEBHOOK_SECRET" },
              { name: "outboundUrl", label: "Outbound Callback URL (Optional)", placeholder: "https://my-api.com/callback" },
            ]}
            onSubmit={async (value) => {
              try {
                await postJson("/api/channels", value);
                setOpen(false);
                await reload();
                toast.success("Webhook channel registered.");
              } catch (e) {
                toast.error("Failed to add channel: " + String(e));
              }
            }}
          />
        </Modal>
      )}
    </div>
  );
}
