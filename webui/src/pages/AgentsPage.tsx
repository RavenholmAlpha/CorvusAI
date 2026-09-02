import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { getJson, postJson } from "../api";
import { Modal, SimpleForm, toast } from "../components";
import type { AgentHierarchyNode } from "../types";
import type { PageProps } from "./shared";
import { defineTranslations, useI18n } from "../i18n";

defineTranslations({
  "agents.canvasTitle": { en: "Agent Topology Architecture", "zh-CN": "智能体拓扑架构画布" },
  "agents.canvasSubtitle": { en: "Multi-agent hierarchy, workspace dispatch network and subagent task orchestration", "zh-CN": "多智能体层级矩阵 · 工作区派发网络 · 子智能体任务编排" },
  "agents.global": { en: "global", "zh-CN": "全局" },
  "agents.spawnChild": { en: "SPAWN CHILD", "zh-CN": "派生子任务" },
  "agents.dispatch": { en: "DISPATCH", "zh-CN": "派发任务" },
  "agents.loading": { en: "Loading agent hierarchy…", "zh-CN": "正在加载智能体层级…" },
  "agents.dispatchTitle": { en: "Dispatch to {name}", "zh-CN": "向 {name} 派发任务" },
  "agents.taskDescription": { en: "Task description", "zh-CN": "任务描述" },
  "agents.featurePlaceholder": { en: "e.g. Audit security vulnerabilities", "zh-CN": "例如：全量代码安全审计" },
  "agents.taskPrompt": { en: "Task prompt", "zh-CN": "任务提示词 / 详细指令" },
  "agents.instructionsPlaceholder": { en: "Detailed steps or execution instructions", "zh-CN": "详细执行指令或说明" },
  "agents.roleOptional": { en: "Role ID (optional)", "zh-CN": "角色 ID（可选，如 architect）" },
  "agents.dispatched": { en: "Task dispatched through agent hierarchy.", "zh-CN": "任务已通过智能体层级派发。" },
  "agents.zoomIn": { en: "Zoom In", "zh-CN": "放大" },
  "agents.zoomOut": { en: "Zoom Out", "zh-CN": "缩小" },
  "agents.resetZoom": { en: "Reset 100%", "zh-CN": "复位 100%" },
  "agents.fitView": { en: "Fit to View", "zh-CN": "适应全屏" },
  "agents.refresh": { en: "Refresh Topology", "zh-CN": "刷新拓扑" },
  "agents.inspectorTitle": { en: "AGENT NODE INSPECTOR", "zh-CN": "智能体节点检查器" },
  "agents.openChat": { en: "OPEN CONVERSATION", "zh-CN": "进入对应对话" },
  "agents.copied": { en: "Copied to clipboard", "zh-CN": "已复制到剪贴板" },
  "agents.noNodes": { en: "No agent nodes found.", "zh-CN": "暂未发现智能体节点。" },
  "agents.all": { en: "ALL", "zh-CN": "全部" },
  "agents.running": { en: "RUNNING", "zh-CN": "运行中" },
  "agents.succeeded": { en: "SUCCEEDED", "zh-CN": "已完成" },
  "agents.failed": { en: "FAILED", "zh-CN": "失败" },
  "agents.expandMore": { en: "▼ Show {count} more completed tasks", "zh-CN": "▼ 展开剩余 {count} 个历史任务" },
  "agents.collapse": { en: "▲ Collapse history", "zh-CN": "▲ 收起历史任务" },
  "agents.noTasks": { en: "No subagent tasks under this filter.", "zh-CN": "该分类下暂无子智能体任务。" },
});

interface PositionedCluster {
  id: string;
  node: AgentHierarchyNode;
  x: number;
  y: number;
  width: number;
  level: "master" | "project";
}

interface Connector {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export function AgentsPage({ reload }: PageProps) {
  const { t } = useI18n();
  const [root, setRoot] = useState<AgentHierarchyNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<AgentHierarchyNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<AgentHierarchyNode | null>(null);

  // Per-project filter and expansion state
  const [projectFilter, setProjectFilter] = useState<Record<string, "all" | "running" | "succeeded" | "failed">>({});
  const [projectExpanded, setProjectExpanded] = useState<Record<string, boolean>>({});

  // Canvas Viewport Pan & Zoom State
  const [pan, setPan] = useState({ x: 80, y: 50 });
  const [zoom, setZoom] = useState(0.95);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ startX: 0, startY: 0, initialPanX: 0, initialPanY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const loadTree = useCallback(async () => {
    try {
      const data = await getJson<AgentHierarchyNode>("/api/v1/agents/tree");
      setRoot(data);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  // Layout Calculation for Option 1 + Option 2 (Master -> Project Clusters)
  const { clusters, connectors, bounds } = useMemo(() => {
    if (!root) {
      return { clusters: [], connectors: [], bounds: { minX: 0, maxX: 900, minY: 0, maxY: 600 } };
    }

    const positionedClusters: PositionedCluster[] = [];
    const svgConnectors: Connector[] = [];

    const MASTER_WIDTH = 420;
    const PROJECT_WIDTH = 420;
    const GAP_X = 60;
    const GAP_Y = 110;

    const projectNodes = root.children.filter((c) => c.level === "project");
    const numProjects = Math.max(1, projectNodes.length);
    const totalProjectsWidth = numProjects * PROJECT_WIDTH + (numProjects - 1) * GAP_X;
    const canvasTotalWidth = Math.max(880, Math.max(MASTER_WIDTH, totalProjectsWidth));

    // 1. Position Master at top center
    const masterX = (canvasTotalWidth - MASTER_WIDTH) / 2;
    const masterY = 40;
    positionedClusters.push({
      id: root.id,
      node: root,
      x: masterX,
      y: masterY,
      width: MASTER_WIDTH,
      level: "master",
    });

    const masterBottomX = masterX + MASTER_WIDTH / 2;
    const masterBottomY = masterY + 110;

    // 2. Position Project Clusters side-by-side
    let currentX = Math.max(30, (canvasTotalWidth - totalProjectsWidth) / 2);
    const projectY = masterBottomY + GAP_Y;

    projectNodes.forEach((proj) => {
      positionedClusters.push({
        id: proj.id,
        node: proj,
        x: currentX,
        y: projectY,
        width: PROJECT_WIDTH,
        level: "project",
      });

      // Connector line: Master -> Project Cluster
      svgConnectors.push({
        id: `c-m-${proj.id}`,
        fromX: masterBottomX,
        fromY: masterBottomY,
        toX: currentX + PROJECT_WIDTH / 2,
        toY: projectY,
      });

      currentX += PROJECT_WIDTH + GAP_X;
    });

    // Compute bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positionedClusters.forEach((c) => {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x + c.width);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y + 400); // estimated cluster height
    });

    return {
      clusters: positionedClusters,
      connectors: svgConnectors,
      bounds: {
        minX: minX === Infinity ? 0 : minX,
        maxX: maxX === -Infinity ? 1000 : maxX,
        minY: minY === Infinity ? 0 : minY,
        maxY: maxY === -Infinity ? 700 : maxY,
      },
    };
  }, [root]);

  // Fit View / Center Canvas
  const fitView = useCallback(() => {
    if (!containerRef.current || clusters.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const contentW = bounds.maxX - bounds.minX + 80;
    const contentH = bounds.maxY - bounds.minY + 80;

    const scaleX = rect.width / contentW;
    const scaleY = rect.height / contentH;
    const newZoom = Math.min(1.05, Math.max(0.5, Math.min(scaleX, scaleY) * 0.92));

    const centerX = rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * newZoom;
    const centerY = Math.max(25, rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * newZoom);

    setZoom(newZoom);
    setPan({ x: centerX, y: centerY });
  }, [bounds, clusters.length]);

  useEffect(() => {
    if (clusters.length > 0) {
      fitView();
    }
  }, [clusters.length, fitView]);

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => Math.min(2.0, Math.max(0.35, prev * zoomFactor)));
  };

  // Mouse Drag Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest(".canvas-node-card") || targetEl.closest(".agent-canvas-toolbar") || targetEl.closest(".agent-canvas-inspector")) {
      return;
    }

    setIsPanning(true);
    panStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPanX: pan.x,
      initialPanY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.startX;
    const dy = e.clientY - panStartRef.current.startY;
    setPan({
      x: panStartRef.current.initialPanX + dx,
      y: panStartRef.current.initialPanY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} ${t("agents.copied")}`);
  };

  const navigateToChat = (sessionId?: string | null) => {
    if (sessionId) {
      sessionStorage.setItem("corvus_pending_chat_session", sessionId);
    }
    location.hash = "chat";
  };

  // Count total subagent tasks across all projects
  const totalSubagentsCount = useMemo(() => {
    if (!root) return 0;
    return root.children.reduce((sum, proj) => sum + proj.children.length, 0);
  }, [root]);

  return (
    <>
      <div
        ref={containerRef}
        className={"agent-canvas-wrapper " + (isPanning ? "is-panning" : "")}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Canvas World Transform Stage */}
        <div
          className="agent-canvas-stage"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* SVG Clean Vector Topology Connectors */}
          <svg className="agent-canvas-svg">
            <defs>
              <linearGradient id="masterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ff7a00" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {connectors.map((c) => {
              const deltaY = c.toY - c.fromY;
              const ctrlY1 = c.fromY + deltaY * 0.5;
              const ctrlY2 = c.toY - deltaY * 0.5;
              const pathD = `M ${c.fromX} ${c.fromY} C ${c.fromX} ${ctrlY1}, ${c.toX} ${ctrlY2}, ${c.toX} ${c.toY}`;

              return (
                <g key={c.id}>
                  <path d={pathD} className="agent-connector-path master-project" />
                  <circle cx={c.fromX} cy={c.fromY} r="4" fill="#ff7a00" />
                  <circle cx={c.toX} cy={c.toY} r="4" fill="#00f0ff" />
                </g>
              );
            })}
          </svg>

          {/* Node Clusters */}
          {clusters.map((cluster) => {
            const { node, level } = cluster;
            const isSelected = selectedNode?.id === cluster.id;

            if (level === "master") {
              return (
                <div
                  key={cluster.id}
                  className={`canvas-node-card level-master ${isSelected ? "selected" : ""}`}
                  style={{
                    left: `${cluster.x}px`,
                    top: `${cluster.y}px`,
                    width: `${cluster.width}px`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNode(node);
                  }}
                >
                  <div className="canvas-node-header">
                    <div className="canvas-node-title" style={{ color: "var(--amber-bright)" }}>
                      <span style={{ fontSize: "16px" }}>👑</span>
                      <span>Corvus Master Agent</span>
                    </div>
                    <span className="canvas-node-badge master">GLOBAL HUB</span>
                  </div>

                  <div className="canvas-node-desc">
                    Global Orchestrator · Coordinating {root?.children.filter((c) => c.level === "project").length || 0} Workspace Repositories · {totalSubagentsCount} Subagents Registered.
                  </div>

                  <div className="canvas-node-meta">
                    <div className="canvas-node-status">
                      <span className="canvas-status-dot active" />
                      <span style={{ color: "var(--amber-bright)" }}>GLOBAL CONTROL PLANE</span>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        className="canvas-node-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTarget(node);
                        }}
                        title={t("agents.dispatch")}
                      >
                        ＋ 派发全局任务
                      </button>
                      {node.sessionId && (
                        <button
                          className="canvas-node-btn"
                          style={{ color: "var(--vfd-cyan)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateToChat(node.sessionId);
                          }}
                          title="进入主控对话"
                        >
                          💬 主控对话
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            // Project Cluster Container Node
            const subagents = node.children || [];
            const filter = projectFilter[node.id] || "all";
            const isExpanded = projectExpanded[node.id] || false;

            const runningCount = subagents.filter((s) => s.status === "running").length;
            const succeededCount = subagents.filter((s) => s.status === "succeeded").length;
            const failedCount = subagents.filter((s) => s.status === "failed").length;

            const filteredSubagents = subagents.filter((s) => {
              if (filter === "running") return s.status === "running";
              if (filter === "succeeded") return s.status === "succeeded";
              if (filter === "failed") return s.status === "failed";
              return true;
            });

            // Running tasks are always pinned at the top
            const runningTasks = filteredSubagents.filter((s) => s.status === "running");
            const otherTasks = filteredSubagents.filter((s) => s.status !== "running");
            const displayOtherTasks = isExpanded ? otherTasks : otherTasks.slice(0, 3);
            const remainingCount = otherTasks.length - 3;

            return (
              <div
                key={cluster.id}
                className={`canvas-node-card level-project-cluster ${isSelected ? "selected" : ""}`}
                style={{
                  left: `${cluster.x}px`,
                  top: `${cluster.y}px`,
                  width: `${cluster.width}px`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode(node);
                }}
              >
                {/* Cluster Header */}
                <div className="canvas-node-header">
                  <div className="canvas-node-title" style={{ color: "var(--vfd-cyan)" }}>
                    <span style={{ fontSize: "16px" }}>📁</span>
                    <span title={node.label}>{node.label}</span>
                  </div>
                  <span className="canvas-node-badge project">PROJECT HOST</span>
                </div>

                <div className="canvas-node-desc">
                  Workspace Host · Subagents: <b>{subagents.length}</b> · Running: <b>{runningCount}</b>
                </div>

                {/* Subagent Status Filter Tabs */}
                <div className="cluster-filter-tabs" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`cluster-filter-btn ${filter === "all" ? "active" : ""}`}
                    onClick={() => setProjectFilter((prev) => ({ ...prev, [node.id]: "all" }))}
                  >
                    全部 ({subagents.length})
                  </button>
                  <button
                    className={`cluster-filter-btn ${filter === "running" ? "active" : ""}`}
                    onClick={() => setProjectFilter((prev) => ({ ...prev, [node.id]: "running" }))}
                    style={{ color: runningCount > 0 ? "var(--amber-bright)" : undefined }}
                  >
                    ⚡ 运行中 ({runningCount})
                  </button>
                  <button
                    className={`cluster-filter-btn ${filter === "succeeded" ? "active" : ""}`}
                    onClick={() => setProjectFilter((prev) => ({ ...prev, [node.id]: "succeeded" }))}
                  >
                    ✓ 已完成 ({succeededCount})
                  </button>
                  {failedCount > 0 && (
                    <button
                      className={`cluster-filter-btn ${filter === "failed" ? "active" : ""}`}
                      onClick={() => setProjectFilter((prev) => ({ ...prev, [node.id]: "failed" }))}
                      style={{ color: "var(--led-red)" }}
                    >
                      ✕ 失败 ({failedCount})
                    </button>
                  )}
                </div>

                {/* Subagents Grid List inside Project Cluster */}
                <div className="cluster-subagents-list" onClick={(e) => e.stopPropagation()}>
                  {filteredSubagents.length === 0 ? (
                    <div style={{ fontSize: "11px", color: "var(--text-dim)", textAlign: "center", padding: "12px 0" }}>
                      {t("agents.noTasks")}
                    </div>
                  ) : (
                    <>
                      {/* Pinned Running Tasks */}
                      {runningTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`cluster-subagent-item running ${selectedNode?.id === task.id ? "selected" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNode(task);
                          }}
                          title={task.label}
                        >
                          <div className="cluster-subagent-info">
                            <div className="cluster-subagent-title">
                              ⚡ {task.label}
                            </div>
                            <div className="cluster-subagent-meta">
                              <span className="canvas-status-dot running" />
                              <span style={{ color: "var(--amber-bright)", fontWeight: 700 }}>RUNNING</span>
                              {task.taskId && <span>· {task.taskId.slice(0, 16)}</span>}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "4px" }}>
                            {task.sessionId && (
                              <button
                                className="canvas-node-btn"
                                style={{ color: "var(--amber-bright)" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateToChat(task.sessionId);
                                }}
                              >
                                💬 对话
                              </button>
                            )}
                            <button
                              className="canvas-node-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTarget(task);
                              }}
                            >
                              ＋ 派生
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Displayed Other (Succeeded/Failed) Tasks */}
                      {displayOtherTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`cluster-subagent-item ${selectedNode?.id === task.id ? "selected" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNode(task);
                          }}
                          title={task.label}
                        >
                          <div className="cluster-subagent-info">
                            <div className="cluster-subagent-title">
                              {task.label}
                            </div>
                            <div className="cluster-subagent-meta">
                              <span className={`canvas-status-dot ${task.status}`} />
                              <span>{task.status.toUpperCase()}</span>
                              {task.taskId && <span>· {task.taskId.slice(0, 16)}</span>}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "4px" }}>
                            {task.sessionId && (
                              <button
                                className="canvas-node-btn"
                                style={{ color: "var(--vfd-cyan)" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateToChat(task.sessionId);
                                }}
                              >
                                💬 对话
                              </button>
                            )}
                            <button
                              className="canvas-node-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTarget(task);
                              }}
                            >
                              ＋ 派生
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Expand/Collapse Toggle for Completed Tasks */}
                      {remainingCount > 0 && (
                        <button
                          className="cluster-expand-btn"
                          onClick={() => setProjectExpanded((prev) => ({ ...prev, [node.id]: !isExpanded }))}
                        >
                          {isExpanded
                            ? t("agents.collapse")
                            : t("agents.expandMore", { count: remainingCount })}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Cluster Footer */}
                <div className="canvas-node-meta" style={{ marginTop: "12px" }}>
                  <div className="canvas-node-status">
                    <span className="canvas-status-dot active" />
                    <span>READY</span>
                  </div>

                  <button
                    className="canvas-node-btn"
                    style={{ color: "var(--vfd-cyan)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTarget(node);
                    }}
                    title={t("agents.dispatch")}
                  >
                    ＋ 派发项目任务
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Floating Canvas Controls Toolbar */}
        <div className="agent-canvas-toolbar" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setZoom((z) => Math.min(2.0, z + 0.1))} title={t("agents.zoomIn")}>
            ＋
          </button>
          <span className="zoom-indicator">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))} title={t("agents.zoomOut")}>
            －
          </button>
          <div className="toolbar-divider" />
          <button onClick={() => { setZoom(1.0); }} title={t("agents.resetZoom")}>
            100%
          </button>
          <button onClick={fitView} title={t("agents.fitView")}>
            ⛶ 居中适应
          </button>
          <div className="toolbar-divider" />
          <button onClick={() => void loadTree()} title={t("agents.refresh")}>
            🔄 刷新拓扑
          </button>
        </div>

        {/* Selected Node Inspector Drawer */}
        {selectedNode && (
          <aside className="agent-canvas-inspector" onClick={(e) => e.stopPropagation()}>
            <div className="inspector-header">
              <h3>{t("agents.inspectorTitle")}</h3>
              <button
                style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "16px" }}
                onClick={() => setSelectedNode(null)}
              >
                ✕
              </button>
            </div>

            <div className="inspector-body">
              <div className="inspector-field">
                <label>Node Label / 智能体名称</label>
                <div className="inspector-field-value" style={{ fontWeight: 700, color: "var(--amber-bright)" }}>
                  {selectedNode.label}
                </div>
              </div>

              <div className="inspector-field">
                <label>Tier Level / 层级架构</label>
                <div className="inspector-field-value">
                  {selectedNode.level.toUpperCase()} ({selectedNode.level === "master" ? "L1 全局中枢" : selectedNode.level === "project" ? "L2 项目宿主" : "L3 任务工作者"})
                </div>
              </div>

              <div className="inspector-field">
                <label>Runtime Status / 状态</label>
                <div className="inspector-field-value" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span className={`canvas-status-dot ${selectedNode.status}`} />
                  <span>{selectedNode.status.toUpperCase()}</span>
                </div>
              </div>

              {selectedNode.projectId && (
                <div className="inspector-field">
                  <label>Associated Project ID / 项目标识</label>
                  <div className="inspector-field-value">
                    {selectedNode.projectId}
                  </div>
                </div>
              )}

              {selectedNode.taskId && (
                <div className="inspector-field">
                  <label>Subagent Task ID / 工单标识</label>
                  <div className="inspector-field-value" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{selectedNode.taskId}</span>
                    <button
                      style={{ fontSize: "10px", padding: "1px 5px" }}
                      onClick={() => copyToClipboard(selectedNode.taskId!, "Task ID")}
                    >
                      📋 复制
                    </button>
                  </div>
                </div>
              )}

              {selectedNode.sessionId && (
                <div className="inspector-field">
                  <label>Bound Session ID / 会话标识</label>
                  <div className="inspector-field-value" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{selectedNode.sessionId}</span>
                    <button
                      style={{ fontSize: "10px", padding: "1px 5px" }}
                      onClick={() => copyToClipboard(selectedNode.sessionId!, "Session ID")}
                    >
                      📋 复制
                    </button>
                  </div>
                </div>
              )}

              <div className="inspector-field">
                <label>Direct Sub-Nodes / 下级节点数量</label>
                <div className="inspector-field-value">
                  {selectedNode.children.length} 个子分支
                </div>
              </div>
            </div>

            <div className="inspector-actions">
              <button
                className="primary"
                style={{ flex: 1 }}
                onClick={() => setTarget(selectedNode)}
              >
                ⚡ {selectedNode.level === "subagent" ? "派生子任务" : "派发任务"}
              </button>
              {selectedNode.sessionId && (
                <button
                  style={{ flex: 1, borderColor: "var(--vfd-cyan)", color: "var(--vfd-cyan)" }}
                  onClick={() => navigateToChat(selectedNode.sessionId)}
                >
                  💬 进入对话
                </button>
              )}
            </div>
          </aside>
        )}

        {loading && (
          <div className="center" style={{ position: "absolute", inset: 0, background: "rgba(9,10,13,0.8)", zIndex: 50 }}>
            <span>{t("agents.loading")}</span>
          </div>
        )}
      </div>

      {/* Task Dispatch Modal */}
      {target && (
        <Modal
          title={t("agents.dispatchTitle", { name: target.label })}
          onClose={() => setTarget(null)}
        >
          <SimpleForm
            fields={[
              {
                name: "description",
                label: t("agents.taskDescription"),
                placeholder: t("agents.featurePlaceholder"),
              },
              {
                name: "prompt",
                label: t("agents.taskPrompt"),
                placeholder: t("agents.instructionsPlaceholder"),
              },
              {
                name: "roleId",
                label: t("agents.roleOptional"),
                placeholder: "architect",
              },
            ]}
            onSubmit={async (value) => {
              try {
                const kind = target.level === "master" ? "global" : target.level === "project" ? "project" : "session";
                await postJson("/api/v1/dispatches", {
                  target: {
                    kind,
                    id: kind === "project" ? target.projectId : kind === "session" ? target.sessionId : undefined,
                  },
                  mode: target.level === "subagent" ? "spawn" : "message",
                  ...value,
                });
                setTarget(null);
                await loadTree();
                await reload();
                toast.success(t("agents.dispatched"));
              } catch (error) {
                toast.error(String(error));
              }
            }}
          />
        </Modal>
      )}
    </>
  );
}
