import React, { useMemo, useState } from "react";
import { Modal, toast } from "../components";
import { postJson } from "../api";
import type { PageProps } from "./shared";

export function MemoryPage({ state, reload }: PageProps) {
  const [kind, setKind] = useState("all");
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [primaryMemoryId, setPrimaryMemoryId] = useState("");
  const [targetMemoryId, setTargetMemoryId] = useState("");
  const [relationType, setRelationType] = useState("relates_to");

  // New Memory state
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState("decision");
  const [newContent, setNewContent] = useState("");
  const [newConfidence, setNewConfidence] = useState("0.9");

  const memories = useMemo(
    () => (kind === "all" ? state.memories : state.memories.filter((memory) => memory.kind === kind)),
    [state.memories, kind]
  );

  const obsolete = async (id: string) => {
    try {
      await postJson("/api/memories/" + id + "/obsolete");
      await reload();
      toast.info("Marked memory entry as obsolete.");
    } catch (e) {
      toast.error("Failed to update status: " + String(e));
    }
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error("Title and Content are required.");
      return;
    }
    try {
      await postJson("/api/memories", {
        projectId: state.activeProjectId,
        kind: newKind,
        title: newTitle.trim(),
        content: newContent.trim(),
        confidence: parseFloat(newConfidence) || 0.9,
      });
      setOpen(false);
      setNewTitle("");
      setNewContent("");
      await reload();
      toast.success("Memory record saved.");
    } catch (e) {
      toast.error("Failed to add memory: " + String(e));
    }
  };

  const handleLinkMemories = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryMemoryId || !targetMemoryId) {
      toast.error("Please select both source and target memories.");
      return;
    }
    if (primaryMemoryId === targetMemoryId) {
      toast.error("Cannot link a memory to itself.");
      return;
    }
    try {
      await postJson("/api/memory-links", {
        memoryId: primaryMemoryId,
        relatedMemoryId: targetMemoryId,
        relation: relationType,
      });
      setLinkOpen(false);
      await reload();
      toast.success("Memory relationship established.");
    } catch (e) {
      toast.error("Failed to link memories: " + String(e));
    }
  };

  return (
    <>
      <div className="memory-toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">ALL MEMORY CATEGORIES ({state.memories.length})</option>
          <option value="architecture">ARCHITECTURE</option>
          <option value="decision">DECISIONS</option>
          <option value="pitfall">PITFALLS</option>
          <option value="open_issue">OPEN ISSUES</option>
          <option value="handoff">HANDOFFS</option>
        </select>
        <button
          onClick={() => {
            if (state.memories.length < 2) {
              toast.error("At least 2 memories are required to establish a link.");
              return;
            }
            setPrimaryMemoryId(state.memories[0]?.id || "");
            setTargetMemoryId(state.memories[1]?.id || "");
            setLinkOpen(true);
          }}
        >
          🔗 LINK MEMORIES
        </button>
        <button className="primary" onClick={() => setOpen(true)}>
          ＋ ADD MEMORY ENTRY
        </button>
      </div>

      <div className="memory-graph">
        {memories.length ? (
          memories.map((memory) => {
            const links = state.memoryLinks.filter(
              (item) => item.memoryId === memory.id || item.relatedMemoryId === memory.id
            );
            return (
              <article className={"memory-node " + memory.kind} key={memory.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                  <b style={{ color: "var(--amber)", fontFamily: "var(--font-mono)", fontSize: "13px" }}>
                    [{memory.kind.toUpperCase()}] {memory.title}
                  </b>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {Math.round(memory.confidence * 100)}% CONF
                  </span>
                </div>
                <p style={{ fontSize: "13px", lineHeight: "1.5", margin: "6px 0 10px", color: "var(--text-main)" }}>{memory.content}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed var(--border-dark)", paddingTop: "8px", marginTop: "6px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {links.map((item, index) => {
                      const otherId = item.memoryId === memory.id ? item.relatedMemoryId : item.memoryId;
                      const otherMem = state.memories.find((m) => m.id === otherId);
                      return (
                        <span className="relation" key={index} title={`Linked to: ${otherMem?.title || otherId}`}>
                          🔗 {item.relation} {otherMem ? `(${otherMem.title.slice(0, 15)})` : ""}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <button
                      style={{ fontSize: "10px", padding: "2px 6px", background: "#181d28", borderColor: "var(--border-mid)" }}
                      onClick={() => {
                        setPrimaryMemoryId(memory.id);
                        const other = state.memories.find((m) => m.id !== memory.id);
                        setTargetMemoryId(other?.id || "");
                        setLinkOpen(true);
                      }}
                      title="Link this memory with another record"
                    >
                      🔗 LINK
                    </button>
                    {memory.status !== "obsolete" && (
                      <button style={{ fontSize: "10px", padding: "2px 6px" }} onClick={() => void obsolete(memory.id)}>
                        OBSOLETE
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            NO MEMORY RECORDS IN CURRENT WORKSPACE
          </div>
        )}
      </div>

      {open && (
        <Modal title="Add Workspace Memory Record" onClose={() => setOpen(false)}>
          <form onSubmit={handleCreateMemory} className="simple-form">
            <div className="form-grid-2col">
              <label>
                Category (分类):
                <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                  <option value="decision">DECISION (架构决策)</option>
                  <option value="architecture">ARCHITECTURE (技术架构)</option>
                  <option value="pitfall">PITFALL (已知坑点与避坑)</option>
                  <option value="open_issue">OPEN ISSUE (待解决问题)</option>
                  <option value="handoff">HANDOFF (交接记录)</option>
                </select>
              </label>
              <label>
                Confidence (置信度 0.0 - 1.0):
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={newConfidence}
                  onChange={(e) => setNewConfidence(e.target.value)}
                />
              </label>
            </div>
            <label style={{ marginTop: "10px" }}>
              Memory Title (记忆标题):
              <input
                type="text"
                placeholder="e.g. Database Indexing Strategy"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
            </label>
            <label style={{ marginTop: "10px" }}>
              Memory Content & Context (详细内容):
              <textarea
                rows={4}
                placeholder="Detailed rationale, constraints, or solution..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Save Memory Record
              </button>
            </div>
          </form>
        </Modal>
      )}

      {linkOpen && (
        <Modal title="Establish Memory Relationship Link" onClose={() => setLinkOpen(false)}>
          <form onSubmit={handleLinkMemories} className="simple-form">
            <label>
              Source Memory (源记忆):
              <select value={primaryMemoryId} onChange={(e) => setPrimaryMemoryId(e.target.value)}>
                {state.memories.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.kind.toUpperCase()}] {m.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid-2col" style={{ marginTop: "10px" }}>
              <label>
                Relationship Type (关系类型):
                <select value={relationType} onChange={(e) => setRelationType(e.target.value)}>
                  <option value="relates_to">RELATES TO (相关联)</option>
                  <option value="supersedes">SUPERSEDES (替代旧决策)</option>
                  <option value="causes">CAUSES (引发原因)</option>
                  <option value="solves">SOLVES (解决对应坑点)</option>
                  <option value="refines">REFINES (细化补充)</option>
                </select>
              </label>
              <label>
                Target Memory (目标记忆):
                <select value={targetMemoryId} onChange={(e) => setTargetMemoryId(e.target.value)}>
                  {state.memories
                    .filter((m) => m.id !== primaryMemoryId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        [{m.kind.toUpperCase()}] {m.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button type="button" onClick={() => setLinkOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Establish Relationship
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
