import React, { useEffect, useRef, useState } from "react";
import { eventUrl, getJson, postJson } from "../api";
import type { Project, Session, SessionContextInfo, Task } from "../types";
import type { PageProps } from "./shared";
import { MessageContent } from "../MessageContent";
import { Modal, SimpleForm, TapeDeckReels, toast } from "../components";

type Action = { type: "rename" | "archive" | "delete"; session: Session } | null;

function ToolCallItem({
  call,
  copyText,
  onJumpToSession,
  tasks,
  currentSessionId,
}: {
  call: any;
  copyText: (text: string, label: string) => void;
  onJumpToSession?: (sessionId: string) => void;
  tasks?: Task[];
  currentSessionId?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const name = call.function?.name || call.name || "tool";
  let formattedArgs = "";
  let parsedArgs: any = null;
  try {
    parsedArgs = typeof call.function?.arguments === "string" ? JSON.parse(call.function.arguments) : (call.function?.arguments || call.arguments);
    formattedArgs = JSON.stringify(parsedArgs, null, 2);
  } catch {
    formattedArgs = String(call.function?.arguments || call.arguments || "{}");
  }

  // Find if this tool call dispatched a subagent task
  const isDispatchTool = name === "dispatch_project_task" || name === "task";
  let matchedChildTask: Task | undefined;
  if (isDispatchTool && tasks && currentSessionId) {
    matchedChildTask = tasks.find(
      (t) => t.parentSessionId === currentSessionId && (t.prompt === parsedArgs?.prompt || t.description === parsedArgs?.description)
    ) || tasks.filter((t) => t.parentSessionId === currentSessionId).slice(-1)[0];
  }

  return (
    <div className="inline-tool-box call">
      <div className="tool-box-header" onClick={() => setCollapsed((v) => !v)}>
        <div className="tool-box-title">
          <span>⚙️ TOOL CALL // <b>{name}</b></span>
          <span className="tool-box-badge call">DISPATCHED</span>
          {matchedChildTask && onJumpToSession && (
            <button
              className="portal-jump-btn"
              onClick={(e) => {
                e.stopPropagation();
                onJumpToSession(matchedChildTask!.childSessionId);
              }}
              title="Jump into the spawned subagent's live conversation transcript"
            >
              ↗ VIEW SUBAGENT [{matchedChildTask.status.toUpperCase()}]
            </button>
          )}
        </div>
        <div className="tool-box-actions" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => copyText(formattedArgs, "Tool arguments")}>COPY ARGS</button>
          <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "4px" }}>{collapsed ? "▶ EXPAND" : "▼ COLLAPSE"}</span>
        </div>
      </div>
      {!collapsed && (
        <div className="tool-box-body">
          <pre className="tool-box-code">{formattedArgs}</pre>
        </div>
      )}
    </div>
  );
}

function ToolResultItem({
  message,
  copyText,
  onJumpToSession,
  tasks,
  currentSessionId,
}: {
  message: any;
  copyText: (text: string, label: string) => void;
  onJumpToSession?: (sessionId: string) => void;
  tasks?: Task[];
  currentSessionId?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const toolName = message.metadata?.name || message.name || (message.toolCallId ? message.toolCallId.slice(0, 16) : "Tool Output");
  const rawContent = String(message.content ?? "");
  let formattedOutput = rawContent;
  let isError = rawContent.toLowerCase().includes('"ok":false') || rawContent.toLowerCase().includes("error:");
  try {
    const parsed = JSON.parse(rawContent);
    formattedOutput = JSON.stringify(parsed, null, 2);
    if (parsed.ok === false || parsed.error) isError = true;
  } catch {
    // Keep raw string
  }

  // Find matching task
  const isDispatchResult = toolName.includes("dispatch_project_task") || toolName.includes("task");
  let matchedChildTask: Task | undefined;
  if (isDispatchResult && tasks && currentSessionId) {
    matchedChildTask = tasks.filter((t) => t.parentSessionId === currentSessionId).slice(-1)[0];
  }

  return (
    <div className="inline-tool-box result">
      <div className="tool-box-header" onClick={() => setCollapsed((v) => !v)}>
        <div className="tool-box-title">
          <span>↳ TOOL OUTPUT // <b>{toolName}</b></span>
          <span className={"tool-box-badge " + (isError ? "error" : "ok")}>
            {isError ? "✗ ERROR / FAILED" : "✓ COMPLETED"}
          </span>
          {matchedChildTask && onJumpToSession && (
            <button
              className="portal-jump-btn"
              onClick={(e) => {
                e.stopPropagation();
                onJumpToSession(matchedChildTask!.childSessionId);
              }}
              title="Jump into the spawned subagent's live conversation transcript"
            >
              ↗ VIEW SUBAGENT [{matchedChildTask.status.toUpperCase()}]
            </button>
          )}
        </div>
        <div className="tool-box-actions" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => copyText(rawContent, "Tool output")}>COPY RESULT</button>
          <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "4px" }}>{collapsed ? "▶ EXPAND" : "▼ COLLAPSE"}</span>
        </div>
      </div>
      {!collapsed && (
        <div className="tool-box-body">
          <pre className="tool-box-code">{formattedOutput || "(empty output)"}</pre>
        </div>
      )}
    </div>
  );
}

export function pendingApprovalsForSession<T extends { sessionId?: string | null }>(approvals: T[], sessionId: string): T[] {
  return sessionId ? approvals.filter((approval) => approval.sessionId === sessionId) : [];
}

export function ChatPage({ state, reload, onToggleSidebar }: PageProps) {
  const project = state.projects.find((item) => item.id === state.activeProjectId);
  const connection = state.activeConnection;
  const [masterSessions, setMasterSessions] = useState<Session[]>([]);
  const [projectSessions, setProjectSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [stream, setStream] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "running" | "canceling" | "failed">("idle");
  const [operationId, setOperationId] = useState("");
  const [activity, setActivity] = useState<Array<{ type: string; createdAt?: string; runId?: string }>>([]);
  const [runId, setRunId] = useState("");
  const [action, setAction] = useState<Action>(null);
  const [renameName, setRenameName] = useState("");
  const [follow, setFollow] = useState(true);
  const [unread, setUnread] = useState(0);
  const [mobileSessionOpen, setMobileSessionOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [sessionContext, setSessionContext] = useState<SessionContextInfo | null>(null);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [switchingModel, setSwitchingModel] = useState(false);

  // 3-Level hierarchy state
  const [sessionScope, setSessionScope] = useState<"master" | "projects">("master");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");

  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeEventSourceRef = useRef<EventSource | null>(null);

  const handleApproval = async (approvalId: string, decision: "allow" | "deny", scope: "once" | "always" | "never" = "once") => {
    try {
      setStatus("running");
      await postJson(`/api/approvals/${approvalId}`, { decision, scope });
      toast[decision === "allow" ? "success" : "info"](decision === "allow" ? "Tool execution approved; conversation resumed." : "Tool execution denied; conversation continued.");
      await Promise.all([reload(), loadMessages(), loadSessionContext()]);
      setStatus("idle");
    } catch (e) {
      setStatus("failed");
      toast.error("Failed to resolve approval: " + String(e));
    }
  };

  const allVisibleSessions = state.allSessions?.length ? state.allSessions : [...masterSessions, ...projectSessions];
  const selectedSession = allVisibleSessions.find((item) => item.id === selected);
  const pendingApprovals = pendingApprovalsForSession(state.approvals, selected);
  const isMasterSession = Boolean(selectedSession && (selectedSession.projectId === null || sessionContext?.isMaster));

  // Check if current session was dispatched as a subagent task (Level 3)
  const dispatchedTask = state.tasks.find((t) => t.childSessionId === selected);
  const parentSession = dispatchedTask ? allVisibleSessions.find((s) => s.id === dispatchedTask.parentSessionId) : null;
  const parentProject = parentSession?.projectId ? state.projects.find((p) => p.id === parentSession.projectId) : null;
  const childSubagentTasks = state.tasks.filter((t) => t.parentSessionId === selected);

  // Group all sessions by project ID for Level 2 rendering
  const sessionsByProject = new Map<string, Session[]>();
  for (const proj of state.projects) {
    sessionsByProject.set(
      proj.id,
      allVisibleSessions.filter((s) => s.projectId === proj.id)
    );
  }

  // Group tasks by parent session ID for Level 3 rendering
  const tasksByParent = new Map<string, Task[]>();
  for (const task of state.tasks) {
    const existing = tasksByParent.get(task.parentSessionId) || [];
    existing.push(task);
    tasksByParent.set(task.parentSessionId, existing);
  }

  const toggleProjectCollapse = (projId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projId)) next.delete(projId);
      else next.add(projId);
      return next;
    });
  };

  const loadSessions = async () => {
    try {
      const masters = await getJson<Session[]>("/api/master/sessions").catch(() => []);
      setMasterSessions(masters);

      let projs: Session[] = [];
      if (project) {
        projs = await getJson<Session[]>("/api/projects/" + project.id + "/sessions").catch(() => []);
        setProjectSessions(projs);
      } else {
        setProjectSessions([]);
      }

      const all = [...masters, ...projs];
      if (!selected && all.length > 0) {
        setSelected(masters[0]?.id || projs[0]?.id);
      }
    } catch (e) {
      toast.error("Failed to load conversations: " + String(e));
    }
  };

  const loadMessages = async () => {
    if (selected) {
      try {
        const list = await getJson<any[]>("/api/sessions/" + selected + "/messages");
        setMessages(list);
      } catch (e) {
        toast.error("Failed to load conversation: " + String(e));
      }
    } else {
      setMessages([]);
    }
  };

  const loadSessionContext = async () => {
    if (!selected) {
      setSessionContext(null);
      return;
    }
    try {
      const info = await getJson<SessionContextInfo>(`/api/sessions/${selected}/context`);
      setSessionContext(info);
    } catch {
      setSessionContext(null);
    }
  };

  const handleRegisterProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newProjectPath.trim()) {
      toast.error("Both project name and path are required.");
      return;
    }
    try {
      const created = await postJson<Project>("/api/projects", { name: newProjectName.trim(), path: newProjectPath.trim() });
      toast.success(`Project "${created.name}" mounted successfully.`);
      setShowAddProjectModal(false);
      setNewProjectName("");
      setNewProjectPath("");
      await reload();
      await loadSessions();
    } catch (e) {
      toast.error("Failed to register project: " + String(e));
    }
  };

  useEffect(() => {
    loadSessions();
  }, [state.activeProjectId]);

  useEffect(() => {
    loadMessages();
    loadSessionContext();
    setStatus("idle");
    setStream("");
    setRunId("");
  }, [selected]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadSessionContext();
    }, 15000);
    return () => clearInterval(timer);
  }, [selected]);

  useEffect(() => {
    const unreadCount = messages.filter((m) => !m.read && m.role === "assistant").length;
    setUnread(unreadCount);
  }, [messages]);

  useEffect(() => {
    if (follow && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, stream, follow]);

  const handleScroll = () => {
    if (messagesRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setFollow(isAtBottom);
    }
  };

  const handleModelSwitch = async (value: string) => {
    if (!selected) return;
    if (!value) { setSwitchingModel(true); try { await postJson(`/api/sessions/${selected}/model`, { providerId: "", model: "" }); await Promise.all([loadSessions(), reload()]); toast.success("Conversation now inherits the global model."); } catch (error) { toast.error("Failed to reset conversation model: " + String(error)); } finally { setSwitchingModel(false); } return; }
    const separator = value.indexOf("::");
    const providerId = value.slice(0, separator);
    const model = value.slice(separator + 2);
    setSwitchingModel(true);
    try {
      await postJson(`/api/sessions/${selected}/model`, { providerId, model });
      toast.success(`Conversation switched to ${providerId} / ${model}.`);
      await Promise.all([loadSessions(), reload()]);
    } catch (error) {
      toast.error("Failed to switch conversation model: " + String(error));
    } finally {
      setSwitchingModel(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || status === "running" || status === "submitting") return;

    let targetSessionId = selected;
    if (!targetSessionId) {
      try {
        const newSession = await postJson<Session>("/api/master/sessions", { name: "Master Conversation" });
        targetSessionId = newSession.id;
        setSelected(targetSessionId);
        await loadSessions();
      } catch (err) {
        toast.error("Could not initialize session: " + String(err));
        return;
      }
    }

    const userText = draft;
    setPromptHistory((prev) => [...prev.filter((p) => p !== userText.trim()), userText.trim()]);
    setHistoryIndex(-1);
    setDraft("");
    setStatus("submitting");
    setStream("");
    setActivity([]);

    setMessages((prev) => [
      ...prev,
      {
        id: "temp-" + Date.now(),
        role: "user",
        content: userText,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const operation = await postJson<{ operationId: string }>("/api/sessions/" + targetSessionId + "/messages", { prompt: userText });
      setOperationId(operation.operationId);
      setStatus("running");

      if (activeEventSourceRef.current) {
        activeEventSourceRef.current.close();
      }

      const source = new EventSource(eventUrl("/api/operations/" + operation.operationId + "/events"));
      activeEventSourceRef.current = source;

      source.addEventListener("activity", (event) => {
        try {
          const item = JSON.parse((event as MessageEvent).data);
          if (item.runId) setRunId(item.runId);
          setActivity((items) => [...items, { type: item.type, createdAt: item.createdAt, runId: item.runId }].slice(-20));
        } catch {}
      });

      source.addEventListener("delta", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          setStream((prev) => prev + (data.text || ""));
        } catch {}
      });

      source.addEventListener("complete", async () => {
        source.close();
        activeEventSourceRef.current = null;
        setStatus("idle");
        setOperationId("");
        setStream("");
        await loadMessages();
        await loadSessionContext();
        void reload();
      });

      source.addEventListener("canceled", () => {
        source.close();
        activeEventSourceRef.current = null;
        setStatus("idle");
        setOperationId("");
        setStream("Run canceled.");
        void reload();
      });

      source.addEventListener("failed", (event) => {
        source.close();
        activeEventSourceRef.current = null;
        setStatus("failed");
        setOperationId("");
        let errorMsg = "Operation failed";
        try {
          errorMsg = JSON.parse((event as MessageEvent).data).error || errorMsg;
        } catch {}
        setStream("Error: " + errorMsg);
        toast.error("Operation failed: " + errorMsg);
      });
    } catch (err: any) {
      toast.error("Failed to send message: " + String(err.message || err));
      setStatus("failed");
    }
  };

  const handleCancel = async () => {
    if (!operationId && !runId) return;
    setStatus("canceling");
    try {
      if (operationId) {
        await postJson("/api/operations/" + operationId + "/cancel", {});
      } else if (runId) {
        await postJson(`/api/runs/${runId}/cancel`, {});
      }
      toast.info("Sent cancel signal to agent.");
    } catch (err) {
      toast.error("Failed to cancel: " + String(err));
    }
  };

  const handleAction = async () => {
    if (!action) return;
    try {
      if (action.type === "rename") {
        if (renameName.trim()) {
          await postJson(`/api/sessions/${action.session.id}/rename`, { name: renameName.trim() });
          toast.success("Conversation renamed.");
        }
      } else if (action.type === "archive") {
        await postJson(`/api/sessions/${action.session.id}/archive`, {});
        toast.info("Conversation archived.");
      } else if (action.type === "delete") {
        await postJson(`/api/sessions/${action.session.id}/delete`, {});
        if (selected === action.session.id) {
          setSelected("");
        }
        toast.info("Conversation deleted.");
      }
      setAction(null);
      await loadSessions();
      await reload();
    } catch (e) {
      toast.error("Action failed: " + String(e));
    }
  };

  const copyText = async (content: string, label = "Text") => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(`${label} copied to clipboard.`);
    } catch {
      toast.error("Could not copy text.");
    }
  };

  // Context usage metrics computation
  const usage = sessionContext?.contextUsage;
  const estimatedTokens = usage?.estimatedTokens ?? (messages.length * 120 + 500);
  const contextWindow = usage?.contextWindow ?? 128000;
  const tokenRatio = Math.min(1, Math.max(0, estimatedTokens / contextWindow));
  const tokenPercent = Math.round(tokenRatio * 100);
  const runningDir = isMasterSession ? "Global Control Plane (Unrestricted)" : (project?.path || parentProject?.path || "Workspace Root");

  return (
    <div className="chat">
      {/* 3-Level Hierarchical Project Tree Sidebar */}
      <div className={"session-list " + (mobileSessionOpen ? "mobile-open" : "")}>
        {/* TOP SEGMENTED SWITCH: MASTER HUB vs PROJECT WORKSPACES */}
        <div className="session-scope-tabs">
          <button
            className={"scope-tab-btn master " + (sessionScope === "master" ? "active" : "")}
            onClick={() => setSessionScope("master")}
          >
            <span className="scope-tab-icon">👑</span>
            <span className="scope-tab-label">主控对话</span>
            <span className="scope-tab-badge">{masterSessions.length}</span>
          </button>
          <button
            className={"scope-tab-btn projects " + (sessionScope === "projects" ? "active" : "")}
            onClick={() => setSessionScope("projects")}
          >
            <span className="scope-tab-icon">📂</span>
            <span className="scope-tab-label">项目工作区</span>
            <span className="scope-tab-badge">{state.projects.length}</span>
          </button>
        </div>

        {sessionScope === "master" ? (
          /* LEVEL 1: MASTER CONTROL PLANE */
          <div className="tree-section">
            <button
              className="new-session-btn master"
              onClick={async () => {
                try {
                  const session = await postJson<Session>("/api/master/sessions", { name: "Master Orchestration Conversation" });
                  await loadSessions();
                  setSelected(session.id);
                  setMobileSessionOpen(false);
                  toast.success("Created new Master Orchestrator session.");
                } catch (e) {
                  toast.error(String(e));
                }
              }}
              title="Create a global orchestrator session without workspace lock"
            >
              ＋ NEW MASTER SESSION
            </button>

            {masterSessions.length === 0 ? (
              <div className="empty-tree-hint">No master sessions yet. Click ＋ NEW MASTER SESSION to create one.</div>
            ) : (
              masterSessions.map((session) => {
                const tasks = tasksByParent.get(session.id) || [];
                return (
                  <div key={session.id} style={{ marginBottom: "6px" }}>
                    <div className={"session-entry master " + (selected === session.id ? "active" : "")}>
                      <div className="session-entry-title-row">
                        <button
                          onClick={() => {
                            setSelected(session.id);
                            setMobileSessionOpen(false);
                          }}
                          title={session.name || "Master Conversation"}
                        >
                          👑 {session.name || "Master Conversation"}
                        </button>
                      </div>
                      <div className="session-entry-actions">
                        <button onClick={() => { setAction({ type: "rename", session }); setRenameName(session.name || ""); }}>Rename</button>
                        <button onClick={() => setAction({ type: "archive", session })}>Archive</button>
                        <button className="danger" onClick={() => setAction({ type: "delete", session })}>Delete</button>
                        <button onClick={() => location.assign(eventUrl("/api/sessions/" + session.id + "/export"))}>Export</button>
                      </div>
                    </div>

                    {/* Subagent tasks spawned directly from master session */}
                    {tasks.length > 0 && (
                      <div className="subagent-branch">
                        {tasks.map((task) => {
                          const isChildSelected = selected === task.childSessionId;
                          return (
                            <div
                              key={task.id}
                              className={"subagent-leaf " + (isChildSelected ? "active" : "")}
                              onClick={() => {
                                setSelected(task.childSessionId);
                                setMobileSessionOpen(false);
                              }}
                              title={`Subagent Worker: ${task.prompt}\nStatus: ${task.status}\nRole: ${task.modelProfile || "default"}`}
                            >
                              <span className={"status-dot " + task.status} />
                              <span className="subagent-role-pill">{task.modelProfile ? `[${task.modelProfile}]` : "[SUB]"}</span>
                              <span className="subagent-prompt">{task.description || task.prompt.slice(0, 24)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* LEVEL 2: PROJECT WORKSPACE MATRIX */
          <div className="tree-section">
            <div className="tree-section-header">
              <div className="tree-section-title">
                <span>📂 WORKSPACE REPOSITORIES</span>
                <span className="tree-section-badge project">{state.projects.length}</span>
              </div>
              <button
                className="tree-action-icon"
                onClick={() => setShowAddProjectModal(true)}
                title="Register a new project directory manually"
              >
                ＋ ADD
              </button>
            </div>

            {state.projects.length === 0 ? (
              <div className="empty-tree-hint">No projects registered yet. Ask Master Agent or click ＋ ADD.</div>
            ) : (
              state.projects.map((proj) => {
                const isCollapsed = collapsedProjects.has(proj.id);
                const projSessions = sessionsByProject.get(proj.id) || [];
                const isActiveProject = proj.id === state.activeProjectId;

                return (
                  <div className={"project-accordion-node " + (isActiveProject ? "active-project" : "")} key={proj.id}>
                    <div className="project-node-header" onClick={() => toggleProjectCollapse(proj.id)}>
                      <div className="project-node-title">
                        <span className="accordion-arrow">{isCollapsed ? "▶" : "▼"}</span>
                        <span className="project-icon">📁</span>
                        <span className="project-name" title={proj.path}>
                          {proj.name}
                        </span>
                      </div>
                      <div className="project-node-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="mini-add-btn"
                          onClick={async () => {
                            try {
                              const newSession = await postJson<Session>("/api/projects/" + proj.id + "/sessions", { name: "Project conversation" });
                              await loadSessions();
                              await reload();
                              setSelected(newSession.id);
                              setMobileSessionOpen(false);
                              toast.success(`Created session in ${proj.name}`);
                            } catch (e) {
                              toast.error(String(e));
                            }
                          }}
                          title={`New session in ${proj.name}`}
                        >
                          ＋ NEW
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="project-node-children">
                        {projSessions.length === 0 ? (
                          <div className="empty-tree-hint">No conversations yet in this project.</div>
                        ) : (
                          projSessions.map((session) => {
                            const tasks = tasksByParent.get(session.id) || [];
                            return (
                              <div key={session.id}>
                                <div className={"session-entry project-session " + (selected === session.id ? "active" : "")}>
                                  <div className="session-entry-title-row">
                                    <button
                                      onClick={() => {
                                        setSelected(session.id);
                                        setMobileSessionOpen(false);
                                        if (proj.id !== state.activeProjectId) {
                                          postJson("/api/projects/select", { projectId: proj.id }).catch(() => {});
                                        }
                                      }}
                                      title={session.name || session.preview || "Conversation"}
                                    >
                                      💬 {session.name || session.preview || "Tape Session"}
                                    </button>
                                  </div>
                                  <div className="session-entry-actions">
                                    <button onClick={() => { setAction({ type: "rename", session }); setRenameName(session.name || ""); }}>Rename</button>
                                    <button onClick={() => setAction({ type: "archive", session })}>Archive</button>
                                    <button className="danger" onClick={() => setAction({ type: "delete", session })}>Delete</button>
                                    <button onClick={() => location.assign(eventUrl("/api/sessions/" + session.id + "/export"))}>Export</button>
                                  </div>
                                </div>

                                {/* LEVEL 3: SUBAGENT TASK BRANCH (SUB-TREE) */}
                                {tasks.length > 0 && (
                                  <div className="subagent-branch">
                                    {tasks.map((task) => {
                                      const isChildSelected = selected === task.childSessionId;
                                      return (
                                        <div
                                          key={task.id}
                                          className={"subagent-leaf " + (isChildSelected ? "active" : "")}
                                          onClick={() => {
                                            setSelected(task.childSessionId);
                                            setMobileSessionOpen(false);
                                          }}
                                          title={`Subagent Worker: ${task.prompt}\nStatus: ${task.status}\nRole: ${task.modelProfile || "default"}`}
                                        >
                                          <span className={"status-dot " + task.status} />
                                          <span className="subagent-role-pill">{task.modelProfile ? `[${task.modelProfile}]` : "[SUB]"}</span>
                                          <span className="subagent-prompt">{task.description || task.prompt.slice(0, 24)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Main Transcript Panel */}
      <div className="transcript">
        {/* Workspace Top Header (Single Clean Unified Header) */}
        <div className="workspace-header">
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: "4px" }}>
            {/* Interactive Lineage Breadcrumbs */}
            <div className="lineage-breadcrumbs">
              {isMasterSession ? (
                <span className="breadcrumb-node master" title="Global Executive AI Orchestrator">
                  👑 MASTER HUB (全局中枢)
                </span>
              ) : dispatchedTask ? (
                <>
                  <span
                    className="breadcrumb-node master"
                    onClick={() => masterSessions[0] && setSelected(masterSessions[0].id)}
                    title="Jump to Master Orchestrator Hub"
                  >
                    👑 MASTER HUB
                  </span>
                  <span className="breadcrumb-separator">➔</span>
                  <span
                    className="breadcrumb-node project"
                    onClick={() => parentSession && setSelected(parentSession.id)}
                    title={`Return to: ${parentSession?.name || "Parent Session"}`}
                  >
                    📂 {parentProject?.name || "PROJECT AGENT"}
                  </span>
                  <span className="breadcrumb-separator">➔</span>
                  <span className="breadcrumb-node subagent" title={`Subagent: ${dispatchedTask.description || dispatchedTask.prompt}`}>
                    ⚡ SUBAGENT [{dispatchedTask.modelProfile || "worker"}]
                  </span>
                </>
              ) : (
                <>
                  <span
                    className="breadcrumb-node master"
                    onClick={() => masterSessions[0] && setSelected(masterSessions[0].id)}
                    title="Switch to Master Orchestrator Hub"
                  >
                    👑 MASTER HUB
                  </span>
                  <span className="breadcrumb-separator">➔</span>
                  <span className="breadcrumb-node project" title={`Project: ${project?.name}`}>
                    📂 {project?.name || "PROJECT AGENT"}
                  </span>
                </>
              )}
            </div>

            <p style={{ margin: 0, color: "var(--text-muted)", font: "11px var(--font-mono)" }}>
              {isMasterSession
                ? `Global Control Plane · Managing ${state.projects.length} Workspace(s) · Model: ${connection.model}`
                : dispatchedTask
                ? `Isolated Subagent Sandbox (Depth ${dispatchedTask.depth}) · Role: ${dispatchedTask.modelProfile || "default"} · ${connection.model}`
                : `Project Workspace Agent · Scope: ${runningDir} · ${connection.model}`}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {selectedSession && Object.keys(state.providers).length > 0 && (
              <label className="conversation-model-selector" title="Provider and model for this conversation only">
                <span>MODEL</span>
                <select
                  aria-label="Conversation provider and model"
                  value={selectedSession.providerId && selectedSession.model ? `${selectedSession.providerId}::${selectedSession.model}` : ""}
                  disabled={switchingModel || status === "running" || status === "submitting"}
                  onChange={(event) => void handleModelSwitch(event.target.value)}
                >
                  <option value="">Global default ({connection.model})</option>
                  {Object.values(state.providers).flatMap((provider) => provider.models.map((model) => (
                    <option key={`${provider.id}::${model}`} value={`${provider.id}::${model}`}>
                      {provider.label ?? provider.id} / {model}
                    </option>
                  )))}
                </select>
              </label>
            )}
            {onToggleSidebar && (
              <button className="menu-toggle" onClick={onToggleSidebar} aria-label="Toggle Navigation Menu">
                ☰
              </button>
            )}
            <button
              onClick={() => void reload()}
              style={{
                fontSize: "11px",
                padding: "4px 8px",
              }}
              title="Refresh system state"
            >
              SYNC
            </button>
            <button
              onClick={() => setInspectorOpen((v) => !v)}
              style={{
                fontSize: "11px",
                padding: "4px 8px",
                background: inspectorOpen ? "var(--amber)" : "#1c1e26",
                color: inspectorOpen ? "#000" : "var(--amber-bright)",
                borderColor: "var(--amber)",
              }}
              title="Toggle detailed context & telemetry HUD"
            >
              📊 HUD {inspectorOpen ? "▲" : "▼"}
            </button>
            <TapeDeckReels active={status === "running"} />
            <span className={"run-chip " + (status === "running" ? "running" : "")}>
              {status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Subagent Lineage Banner (Visible when viewing Level 3 Worker Task) */}
        {dispatchedTask && (
          <div className="subagent-lineage-banner">
            <div className="subagent-banner-info">
              <span>⚡ SUBAGENT TASK (DEPTH {dispatchedTask.depth})</span>
              <span style={{ color: "#fff" }}>
                Goal: <b>{dispatchedTask.description || dispatchedTask.prompt.slice(0, 50)}</b>
              </span>
            </div>
            {parentSession && (
              <button
                className="subagent-return-btn"
                onClick={() => setSelected(parentSession.id)}
                title={`Return to: ${parentSession.name || "Parent Session"}`}
              >
                ↖ RETURN TO PARENT SESSION
              </button>
            )}
          </div>
        )}

        {/* Telemetry HUD Ribbon */}
        <div className="telemetry-hud">
          <div className="telemetry-hud-left">
            {isMasterSession ? (
              <span className="dispatch-badge master" title="Global Executive AI Orchestrator with cross-workspace dispatching capabilities">
                👑 GLOBAL MASTER ORCHESTRATOR
              </span>
            ) : dispatchedTask ? (
              <span className="dispatch-badge subagent" title={`Dispatched from Parent Session: ${dispatchedTask.parentSessionId}\nTask: ${dispatchedTask.prompt}`}>
                ⚡ SUBAGENT TASK (DEPTH {dispatchedTask.depth}) · ROLE: {dispatchedTask.modelProfile || "default"}
              </span>
            ) : (
              <span className="dispatch-badge root" title="Direct interactive project workspace session">
                📂 PROJECT WORKSPACE AGENT
              </span>
            )}

            <span className="directory-pill" title={`Working Scope: ${runningDir}`}>
              <span>{isMasterSession ? "🌐 SCOPE:" : "📂 DIR:"}</span>
              <code>{runningDir}</code>
              {!isMasterSession && (
                <button
                  style={{ background: "transparent", border: "none", boxShadow: "none", padding: "0 2px", color: "var(--text-dim)", cursor: "pointer", fontSize: "11px" }}
                  onClick={() => copyText(runningDir, "Directory path")}
                  title="Copy working directory"
                >
                  📋
                </button>
              )}
            </span>

            {childSubagentTasks.length > 0 && (
              <span style={{ color: "var(--amber-bright)", fontSize: "11px" }} title="Subagent child tasks spawned by this conversation">
                👶 {childSubagentTasks.length} SUBAGENT{childSubagentTasks.length === 1 ? "" : "S"} SPAWNED
              </span>
            )}
          </div>

          <div className="telemetry-hud-right">
            <div className="context-meter-gauge" title={`Estimated Context Tokens: ${estimatedTokens.toLocaleString()} / ${contextWindow.toLocaleString()} (${tokenPercent}%)\nLast request: ${usage?.lastRequestTokens ?? 0} tokens`}>
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>CONTEXT:</span>
              <div className="context-bar-wrap">
                <div className="context-bar-fill" style={{ width: `${tokenPercent}%` }} />
              </div>
              <span className="context-pct-label">{tokenPercent}%</span>
            </div>
          </div>
        </div>

        {/* Modal: Register Workspace Project Manually */}
        {showAddProjectModal && (
          <Modal title="Register Project Workspace (添加项目工作区)" onClose={() => setShowAddProjectModal(false)}>
            <form onSubmit={handleRegisterProject} className="simple-form">
              <label>
                Project Name (项目名称):
                <input
                  type="text"
                  placeholder="e.g. My Next.js WebApp"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  autoFocus
                />
              </label>
              <label style={{ marginTop: "10px" }}>
                Absolute Local Path (本地绝对路径):
                <input
                  type="text"
                  placeholder="e.g. D:/projects/my-app"
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                <button type="button" onClick={() => setShowAddProjectModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Register Workspace (挂载项目)
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Messages Transcript */}
        <div className="messages" ref={messagesRef} onScroll={handleScroll}>
          {/* Inline Pending Approvals Banner */}
          {pendingApprovals.length > 0 && (
            <div className="inline-approval-card">
              <div className="inline-approval-header">
                <span className="inline-approval-title">
                  🛡️ PENDING PERMISSION APPROVAL ({pendingApprovals.length})
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>High-risk tool call paused</span>
              </div>
              {pendingApprovals.map((app) => (
                <div key={app.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#150a0d", padding: "8px 10px", borderRadius: "3px" }}>
                  <div>
                    <b style={{ color: "#ff8080", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                      ⚙️ {app.toolName || "tool"}
                    </b>
                    <pre style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--text-muted)", maxHeight: "60px", overflow: "auto" }}>
                      {JSON.stringify(app.toolCall?.arguments || {}, null, 2)}
                    </pre>
                  </div>
                  <div className="inline-approval-actions">
                    <button className="approval-btn allow" onClick={() => void handleApproval(app.id, "allow", "once")}>✓ ALLOW ONCE</button>
                    <button className="approval-btn allow" onClick={() => void handleApproval(app.id, "allow", "always")}>✓ ALWAYS ALLOW</button>
                    <button className="approval-btn reject" onClick={() => void handleApproval(app.id, "deny", "once")}>✗ DENY ONCE</button>
                    <button className="approval-btn reject" onClick={() => void handleApproval(app.id, "deny", "never")}>✗ NEVER ALLOW</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {messages.length === 0 && !stream && (
            <div className="empty-state">
              <div className="empty-state-icon">{isMasterSession ? "👑" : dispatchedTask ? "⚡" : "📂"}</div>
              <h3>
                {isMasterSession
                  ? "GLOBAL MASTER ORCHESTRATOR"
                  : dispatchedTask
                  ? `SUBAGENT WORKER // ${dispatchedTask.modelProfile || "specialist"}`
                  : `PROJECT WORKSPACE // ${project?.name || "Corvus"}`}
              </h3>
              <p>
                {isMasterSession
                  ? "Talk to the Master Agent to register projects, design systems, or dispatch tasks across workspaces."
                  : dispatchedTask
                  ? `Task: "${dispatchedTask.prompt}"`
                  : "Send instructions to write code, inspect files, run tests, or dispatch subagents in this repository."}
              </p>
            </div>
          )}

          {messages.map((msg, index) => {
            if (msg.role === "tool") {
              return (
                <ToolResultItem
                  key={msg.id || index}
                  message={msg}
                  copyText={copyText}
                  onJumpToSession={(sId) => setSelected(sId)}
                  tasks={state.tasks}
                  currentSessionId={selected}
                />
              );
            }

            const toolCalls = msg.metadata?.tool_calls || msg.tool_calls || [];
            const hasContent = Boolean(msg.content && msg.content.trim());
            return (
              <React.Fragment key={msg.id || index}>
                {hasContent && (
                  <div className={"message-bubble " + msg.role}>
                    <div className="message-header">
                      <span className="message-sender">
                        {msg.role === "user"
                          ? "👤 OPERATOR"
                          : isMasterSession
                          ? "👑 MASTER ORCHESTRATOR"
                          : dispatchedTask
                          ? `⚡ SUBAGENT [${dispatchedTask.modelProfile || "worker"}]`
                          : "📂 PROJECT AGENT"}
                      </span>
                      <span className="message-time">{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ""}</span>
                    </div>
                    <MessageContent text={msg.content || ""} />
                  </div>
                )}

                {toolCalls.map((call: any, cIdx: number) => (
                  <ToolCallItem
                    key={cIdx}
                    call={call}
                    copyText={copyText}
                    onJumpToSession={(sId) => setSelected(sId)}
                    tasks={state.tasks}
                    currentSessionId={selected}
                  />
                ))}
              </React.Fragment>
            );
          })}

          {stream && (
            <div className="message-bubble assistant streaming">
              <div className="message-header">
                <span className="message-sender">
                  {isMasterSession ? "👑 MASTER ORCHESTRATOR" : dispatchedTask ? "⚡ SUBAGENT" : "📂 PROJECT AGENT"} (STREAMING...)
                </span>
              </div>
              <MessageContent text={stream} isStreaming={true} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form className="chat-input-bar" onSubmit={handleSend}>
          <textarea
            ref={textareaRef}
            rows={2}
            placeholder={
              isMasterSession
                ? "Instruct Master Agent: '帮我把 XX项目 加上 XX功能' 或 '添加 D:/project 进工作区'..."
                : dispatchedTask
                ? "Subagent running task. You may provide additional input..."
                : `Instruct ${project?.name || "Project"} Agent to build, test, refactor, or spawn subagents...`
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend(e);
              } else if (e.key === "ArrowUp" && (!draft.trim() || historyIndex >= 0) && promptHistory.length > 0) {
                e.preventDefault();
                const nextIndex = historyIndex === -1 ? promptHistory.length - 1 : Math.max(0, historyIndex - 1);
                setHistoryIndex(nextIndex);
                setDraft(promptHistory[nextIndex]);
              } else if (e.key === "ArrowDown" && historyIndex >= 0) {
                e.preventDefault();
                const nextIndex = historyIndex + 1;
                if (nextIndex < promptHistory.length) {
                  setHistoryIndex(nextIndex);
                  setDraft(promptHistory[nextIndex]);
                } else {
                  setHistoryIndex(-1);
                  setDraft("");
                }
              }
            }}
          />
          <div className="chat-input-actions">
            {status === "running" ? (
              <button type="button" className="danger" onClick={handleCancel}>
                ⏹ STOP RUN
              </button>
            ) : (
              <button type="submit" className="primary" disabled={!draft.trim() || status === "submitting"}>
                SEND ↵
              </button>
            )}
          </div>
        </form>
      </div>

      {action && (
        <Modal title={`${action.type.toUpperCase()} SESSION`} onClose={() => setAction(null)}>
          {action.type === "rename" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAction();
              }}
            >
              <label>
                New Conversation Title:
                <input
                  type="text"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  autoFocus
                  style={{ width: "100%", marginTop: "6px" }}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                <button type="button" onClick={() => setAction(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Save Title
                </button>
              </div>
            </form>
          ) : (
            <>
              <p>
                {action.type === "delete"
                  ? `Permanently delete conversation "${action.session.name || action.session.id}"? This cannot be undone.`
                  : `Archive conversation "${action.session.name || action.session.id}" from the active index?`}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                <button onClick={() => setAction(null)}>Cancel</button>
                <button className="danger" onClick={handleAction}>
                  Confirm {action.type}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
