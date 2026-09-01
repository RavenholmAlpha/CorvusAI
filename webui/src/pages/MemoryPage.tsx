import React, { useMemo, useState } from "react";
import { Modal, toast } from "../components";
import { postJson } from "../api";
import type { PageProps } from "./shared";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "memory.obsoleteSuccess": { en: "Marked memory entry as obsolete.", "zh-CN": "已将记忆条目标记为过时。" },
  "memory.statusError": { en: "Failed to update status: {error}", "zh-CN": "更新状态失败：{error}" },
  "memory.required": { en: "Title and content are required.", "zh-CN": "标题和内容为必填项。" },
  "memory.saved": { en: "Memory record saved.", "zh-CN": "记忆记录已保存。" },
  "memory.createError": { en: "Failed to add memory: {error}", "zh-CN": "添加记忆失败：{error}" },
  "memory.selectBoth": { en: "Please select both source and target memories.", "zh-CN": "请选择源记忆和目标记忆。" },
  "memory.selfLink": { en: "Cannot link a memory to itself.", "zh-CN": "记忆不能链接到自身。" },
  "memory.linked": { en: "Memory relationship established.", "zh-CN": "记忆关系已建立。" },
  "memory.linkError": { en: "Failed to link memories: {error}", "zh-CN": "链接记忆失败：{error}" },
  "memory.allCategories": { en: "ALL MEMORY CATEGORIES ({count})", "zh-CN": "所有记忆分类（{count}）" },
  "memory.architecture": { en: "ARCHITECTURE", "zh-CN": "架构" },
  "memory.decisions": { en: "DECISIONS", "zh-CN": "决策" },
  "memory.decision": { en: "DECISION", "zh-CN": "决策" },
  "memory.pitfalls": { en: "PITFALLS", "zh-CN": "已知坑点" },
  "memory.pitfall": { en: "PITFALL", "zh-CN": "已知坑点" },
  "memory.openIssues": { en: "OPEN ISSUES", "zh-CN": "待解决问题" },
  "memory.openIssue": { en: "OPEN ISSUE", "zh-CN": "待解决问题" },
  "memory.handoffs": { en: "HANDOFFS", "zh-CN": "交接记录" },
  "memory.handoff": { en: "HANDOFF", "zh-CN": "交接记录" },
  "memory.needTwo": { en: "At least 2 memories are required to establish a link.", "zh-CN": "至少需要两条记忆才能建立链接。" },
  "memory.linkMemories": { en: "🔗 LINK MEMORIES", "zh-CN": "🔗 链接记忆" },
  "memory.addEntry": { en: "＋ ADD MEMORY ENTRY", "zh-CN": "＋ 添加记忆条目" },
  "memory.confidenceShort": { en: "{value}% CONF", "zh-CN": "置信度 {value}%" },
  "memory.linkedTo": { en: "Linked to: {target}", "zh-CN": "链接到：{target}" },
  "memory.link": { en: "🔗 LINK", "zh-CN": "🔗 链接" },
  "memory.linkTitle": { en: "Link this memory with another record", "zh-CN": "将此记忆与另一条记录链接" },
  "memory.obsolete": { en: "OBSOLETE", "zh-CN": "标记过时" },
  "memory.empty": { en: "NO MEMORY RECORDS IN CURRENT WORKSPACE", "zh-CN": "当前工作区中没有记忆记录" },
  "memory.addTitle": { en: "Add Workspace Memory Record", "zh-CN": "添加工作区记忆记录" },
  "memory.category": { en: "Category:", "zh-CN": "分类：" },
  "memory.confidence": { en: "Confidence (0.0–1.0):", "zh-CN": "置信度（0.0–1.0）：" },
  "memory.title": { en: "Memory title:", "zh-CN": "记忆标题：" },
  "memory.titlePlaceholder": { en: "e.g. Database Indexing Strategy", "zh-CN": "例如：数据库索引策略" },
  "memory.content": { en: "Memory content and context:", "zh-CN": "记忆内容和上下文：" },
  "memory.contentPlaceholder": { en: "Detailed rationale, constraints, or solution...", "zh-CN": "详细的理由、约束或解决方案……" },
  "memory.save": { en: "Save Memory Record", "zh-CN": "保存记忆记录" },
  "memory.relationshipTitle": { en: "Establish Memory Relationship Link", "zh-CN": "建立记忆关系链接" },
  "memory.source": { en: "Source memory:", "zh-CN": "源记忆：" },
  "memory.relationshipType": { en: "Relationship type:", "zh-CN": "关系类型：" },
  "memory.relatesTo": { en: "RELATES TO", "zh-CN": "相关联" },
  "memory.supersedes": { en: "SUPERSEDES", "zh-CN": "替代旧决策" },
  "memory.causes": { en: "CAUSES", "zh-CN": "引发原因" },
  "memory.solves": { en: "SOLVES", "zh-CN": "解决对应坑点" },
  "memory.refines": { en: "REFINES", "zh-CN": "细化补充" },
  "memory.target": { en: "Target memory:", "zh-CN": "目标记忆：" },
  "memory.establish": { en: "Establish Relationship", "zh-CN": "建立关系" },
});

export function MemoryPage({ state, reload }: PageProps) {
  const { t } = useI18n();
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
  const kindLabel = (value: string) => {
    const keys: Record<string, string> = {
      architecture: "memory.architecture",
      decision: "memory.decision",
      pitfall: "memory.pitfall",
      open_issue: "memory.openIssue",
      handoff: "memory.handoff",
    };
    return keys[value] ? t(keys[value]) : value;
  };
  const relationLabel = (value: string) => {
    const keys: Record<string, string> = {
      relates_to: "memory.relatesTo",
      supersedes: "memory.supersedes",
      causes: "memory.causes",
      solves: "memory.solves",
      refines: "memory.refines",
    };
    return keys[value] ? t(keys[value]) : value;
  };

  const memories = useMemo(
    () => (kind === "all" ? state.memories : state.memories.filter((memory) => memory.kind === kind)),
    [state.memories, kind]
  );

  const obsolete = async (id: string) => {
    try {
      await postJson("/api/memories/" + id + "/obsolete");
      await reload();
      toast.info(t("memory.obsoleteSuccess"));
    } catch (e) {
      toast.error(t("memory.statusError", { error: String(e) }));
    }
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error(t("memory.required"));
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
      toast.success(t("memory.saved"));
    } catch (e) {
      toast.error(t("memory.createError", { error: String(e) }));
    }
  };

  const handleLinkMemories = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryMemoryId || !targetMemoryId) {
      toast.error(t("memory.selectBoth"));
      return;
    }
    if (primaryMemoryId === targetMemoryId) {
      toast.error(t("memory.selfLink"));
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
      toast.success(t("memory.linked"));
    } catch (e) {
      toast.error(t("memory.linkError", { error: String(e) }));
    }
  };

  return (
    <>
      <div className="memory-toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">{t("memory.allCategories", { count: state.memories.length })}</option>
          <option value="architecture">{t("memory.architecture")}</option>
          <option value="decision">{t("memory.decisions")}</option>
          <option value="pitfall">{t("memory.pitfalls")}</option>
          <option value="open_issue">{t("memory.openIssues")}</option>
          <option value="handoff">{t("memory.handoffs")}</option>
        </select>
        <button
          onClick={() => {
            if (state.memories.length < 2) {
              toast.error(t("memory.needTwo"));
              return;
            }
            setPrimaryMemoryId(state.memories[0]?.id || "");
            setTargetMemoryId(state.memories[1]?.id || "");
            setLinkOpen(true);
          }}
        >
          {t("memory.linkMemories")}
        </button>
        <button className="primary" onClick={() => setOpen(true)}>
          {t("memory.addEntry")}
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
                    [{kindLabel(memory.kind)}] {memory.title}
                  </b>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {t("memory.confidenceShort", { value: Math.round(memory.confidence * 100) })}
                  </span>
                </div>
                <p style={{ fontSize: "13px", lineHeight: "1.5", margin: "6px 0 10px", color: "var(--text-main)" }}>{memory.content}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed var(--border-dark)", paddingTop: "8px", marginTop: "6px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {links.map((item, index) => {
                      const otherId = item.memoryId === memory.id ? item.relatedMemoryId : item.memoryId;
                      const otherMem = state.memories.find((m) => m.id === otherId);
                      return (
                        <span className="relation" key={index} title={t("memory.linkedTo", { target: otherMem?.title || otherId })}>
                          🔗 {relationLabel(item.relation)} {otherMem ? `(${otherMem.title.slice(0, 15)})` : ""}
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
                      title={t("memory.linkTitle")}
                    >
                      {t("memory.link")}
                    </button>
                    {memory.status !== "obsolete" && (
                      <button style={{ fontSize: "10px", padding: "2px 6px" }} onClick={() => void obsolete(memory.id)}>
                        {t("memory.obsolete")}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {t("memory.empty")}
          </div>
        )}
      </div>

      {open && (
        <Modal title={t("memory.addTitle")} onClose={() => setOpen(false)}>
          <form onSubmit={handleCreateMemory} className="simple-form">
            <div className="form-grid-2col">
              <label>
                {t("memory.category")}
                <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                  <option value="decision">{t("memory.decision")}</option>
                  <option value="architecture">{t("memory.architecture")}</option>
                  <option value="pitfall">{t("memory.pitfall")}</option>
                  <option value="open_issue">{t("memory.openIssue")}</option>
                  <option value="handoff">{t("memory.handoff")}</option>
                </select>
              </label>
              <label>
                {t("memory.confidence")}
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
              {t("memory.title")}
              <input
                type="text"
                placeholder={t("memory.titlePlaceholder")}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
            </label>
            <label style={{ marginTop: "10px" }}>
              {t("memory.content")}
              <textarea
                rows={4}
                placeholder={t("memory.contentPlaceholder")}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button type="button" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="primary">
                {t("memory.save")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {linkOpen && (
        <Modal title={t("memory.relationshipTitle")} onClose={() => setLinkOpen(false)}>
          <form onSubmit={handleLinkMemories} className="simple-form">
            <label>
              {t("memory.source")}
              <select value={primaryMemoryId} onChange={(e) => setPrimaryMemoryId(e.target.value)}>
                {state.memories.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{kindLabel(m.kind)}] {m.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid-2col" style={{ marginTop: "10px" }}>
              <label>
                {t("memory.relationshipType")}
                <select value={relationType} onChange={(e) => setRelationType(e.target.value)}>
                  <option value="relates_to">{t("memory.relatesTo")}</option>
                  <option value="supersedes">{t("memory.supersedes")}</option>
                  <option value="causes">{t("memory.causes")}</option>
                  <option value="solves">{t("memory.solves")}</option>
                  <option value="refines">{t("memory.refines")}</option>
                </select>
              </label>
              <label>
                {t("memory.target")}
                <select value={targetMemoryId} onChange={(e) => setTargetMemoryId(e.target.value)}>
                  {state.memories
                    .filter((m) => m.id !== primaryMemoryId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        [{kindLabel(m.kind)}] {m.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button type="button" onClick={() => setLinkOpen(false)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="primary">
                {t("memory.establish")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
