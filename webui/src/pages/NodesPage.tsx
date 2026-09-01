import React, { useEffect, useState } from "react";
import { Card, Modal, SimpleForm, toast } from "../components";
import { getJson, postJson } from "../api";

interface Node {
  id: string;
  label?: string;
  type: string;
  enabled: boolean;
}

export function NodesPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [output, setOutput] = useState("");
  const [execNode, setExecNode] = useState<Node | null>(null);

  useEffect(() => {
    void getJson<Node[]>("/api/nodes").then(setNodes).catch(() => setNodes([]));
  }, []);

  const testNode = async (id: string) => {
    try {
      toast.info("Testing execution node connectivity...");
      const res = await postJson("/api/nodes/" + id + "/test");
      setOutput(JSON.stringify(res, null, 2));
      toast.success("Node test passed.");
    } catch (e) {
      toast.error("Node test failed: " + String(e));
      setOutput(String(e));
    }
  };

  return (
    <>
      <div className="grid">
        <Card title="Configured Execution Nodes">
          {nodes.length ? (
            nodes.map((node) => (
              <article key={node.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div>
                  <b style={{ color: "var(--amber)", fontFamily: "var(--font-mono)" }}>
                    {node.enabled ? "● " : "○ "}
                    {node.label || node.id}
                  </b>
                  <p style={{ margin: "2px 0", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                    Type: {node.type} · Status: {node.enabled ? "ENABLED" : "DISABLED"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => void testNode(node.id)}>TEST</button>
                  <button className="primary" onClick={() => setExecNode(node)}>
                    EXECUTE COMMAND
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>
              No execution nodes configured. Register SSH or Docker nodes in Settings.
            </p>
          )}
        </Card>

        <Card title="Node Output & Telemetry Console">
          <pre style={{ minHeight: "220px" }}>{output || "// Terminal output logs will stream here"}</pre>
        </Card>
      </div>

      {execNode && (
        <Modal title={`Execute Command on [${execNode.id}]`} onClose={() => setExecNode(null)}>
          <SimpleForm
            fields={[
              { name: "command", label: "Shell Command to Execute", placeholder: "uname -a && uptime" },
              { name: "confirm", label: `Type '${execNode.id}' to confirm execution`, placeholder: execNode.id },
            ]}
            onSubmit={async (val) => {
              if (val.confirm !== execNode.id) {
                toast.error(`Confirmation mismatch: Please type '${execNode.id}' exactly.`);
                return;
              }
              try {
                toast.info("Dispatching command to node...");
                const result = await postJson("/api/nodes/" + execNode.id + "/execute", {
                  command: val.command,
                  confirm: execNode.id,
                });
                setOutput(JSON.stringify(result, null, 2));
                setExecNode(null);
                toast.success("Command executed.");
              } catch (e) {
                toast.error("Execution failed: " + String(e));
                setOutput(String(e));
              }
            }}
          />
        </Modal>
      )}
    </>
  );
}