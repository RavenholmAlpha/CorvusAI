import React, { useMemo, useState } from "react";
import { Card } from "../components";
import { eventUrl } from "../api";
import type { PageProps } from "./shared";

export function TimelinePage({ state }: PageProps) {
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
          placeholder="Filter events / payload JSON..."
          style={{ width: "260px" }}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">ALL EVENT TYPES</option>
          {types.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <button className="primary" onClick={() => location.assign(eventUrl("/api/audit/export"))}>
          EXPORT AUDIT LOG ↓
        </button>
      </div>

      <div className="grid">
        <Card title={`Timeline Event Log (${events.length})`}>
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
                  {event.runId && <span style={{ color: "var(--vfd-cyan)", marginLeft: "8px" }}>RUN: {event.runId}</span>}
                </summary>
                <pre style={{ marginTop: "8px", background: "#090a0d" }}>{JSON.stringify(event, null, 2)}</pre>
              </details>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>No matching events found.</p>
          )}
        </Card>

        <Card title={`Artifacts & Evidence Store (${state.artifacts.length})`}>
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
            <p style={{ color: "var(--text-muted)", margin: 0 }}>No artifacts recorded yet.</p>
          )}
        </Card>
      </div>
    </>
  );
}
