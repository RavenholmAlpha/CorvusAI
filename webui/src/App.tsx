import React, { useCallback, useEffect, useState } from "react";
import { eventUrl, getRuntimeCapabilities, getState, type RuntimeCapabilities } from "./api";
import type { WebState } from "./types";
import { TapeDeckReels, ToastContainer, ZoomControl, toast } from "./components";
import { OverviewPage } from "./pages/OverviewPage";
import { ChatPage } from "./pages/ChatPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { AgentsPage } from "./pages/AgentsPage";
import { TasksPage } from "./pages/TasksPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { MemoryPage } from "./pages/MemoryPage";
import { TimelinePage } from "./pages/TimelinePage";
import { SettingsPage } from "./pages/SettingsPage";
import { AutomationsPage } from "./pages/AutomationsPage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { RoutingPage } from "./pages/RoutingPage";
import { SkillsPage } from "./pages/SkillsPage";
import { BrowserPage } from "./pages/BrowserPage";
import { NodesPage } from "./pages/NodesPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { InstallationPage } from "./pages/InstallationPage";
import { SecretsPage } from "./pages/SecretsPage";
import { TeamPage } from "./pages/TeamPage";
import { LoginPage } from "./pages/LoginPage";
import { defineTranslations, I18nProvider, useI18n, type Locale } from "./i18n";
import { postJson, clearWebToken } from "./api";


defineTranslations({
  "app.group.core": { en: "CORE WORKBENCH", "zh-CN": "核心工作台" }, "app.group.team": { en: "COLLABORATION", "zh-CN": "多人协同" }, "app.group.agents": { en: "AGENTS & EXECUTION", "zh-CN": "智能体与执行" }, "app.group.knowledge": { en: "KNOWLEDGE & EXTENSIONS", "zh-CN": "知识与扩展" }, "app.group.gateway": { en: "GATEWAY & CONFIG", "zh-CN": "网关与配置" },
  "app.page.chat": { en: "CHAT CONTROL", "zh-CN": "对话控制" }, "app.page.overview": { en: "OVERVIEW", "zh-CN": "概览" }, "app.page.projects": { en: "PROJECTS", "zh-CN": "项目" }, "app.page.team": { en: "TEAM", "zh-CN": "多人协同" }, "app.page.agents": { en: "HIERARCHY", "zh-CN": "智能体层级" }, "app.page.tasks": { en: "TASKS", "zh-CN": "任务" }, "app.page.approvals": { en: "APPROVALS", "zh-CN": "审批" }, "app.page.timeline": { en: "TIMELINE", "zh-CN": "时间线" }, "app.page.memory": { en: "MEMORY", "zh-CN": "记忆" }, "app.page.skills": { en: "SKILLS", "zh-CN": "技能" }, "app.page.integrations": { en: "MCP & PLUGINS", "zh-CN": "MCP 与插件" }, "app.page.secrets": { en: "SECRETS", "zh-CN": "密钥" }, "app.page.channels": { en: "CHANNELS", "zh-CN": "通道" }, "app.page.automations": { en: "AUTOMATIONS", "zh-CN": "自动化" }, "app.page.routing": { en: "ROUTING", "zh-CN": "路由" }, "app.page.browser": { en: "BROWSER", "zh-CN": "浏览器" }, "app.page.nodes": { en: "NODES", "zh-CN": "节点" }, "app.page.installation": { en: "BUNDLES", "zh-CN": "功能包" }, "app.page.settings": { en: "SETTINGS", "zh-CN": "设置" },
  "app.brand": { en: "CORVUS", "zh-CN": "CORVUS" }, "app.badge": { en: "C-90 TAPE", "zh-CN": "C-90 磁带" }, "app.connecting": { en: "CONNECTING TO CORVUS DECK-01...", "zh-CN": "正在连接 CORVUS 控制台..." }, "app.controlPlane": { en: "DECK-01 // CONTROL PLANE", "zh-CN": "DECK-01 // 控制平面" }, "app.local": { en: "LOCAL // STEREO", "zh-CN": "本地 // 双声道" }, "app.projectsCount": { en: "{count} PROJECTS", "zh-CN": "{count} 个项目" }, "app.noWorkspace": { en: "NO ACTIVE WORKSPACE", "zh-CN": "没有活动工作区" }, "app.noProject": { en: "No active project", "zh-CN": "没有活动项目" }, "app.activeTape": { en: "[TAPE: {name}] {path}", "zh-CN": "[磁带：{name}] {path}" }, "app.recording": { en: "REC ●", "zh-CN": "录制 ●" }, "app.playing": { en: "PLAY ▶", "zh-CN": "播放 ▶" }, "app.sync": { en: "SYNC", "zh-CN": "同步" }, "app.refresh": { en: "Refresh system state", "zh-CN": "刷新系统状态" }, "app.dismiss": { en: "DISMISS", "zh-CN": "关闭" }, "app.menu": { en: "Toggle navigation menu", "zh-CN": "切换导航菜单" }, "app.fault": { en: "FAULT", "zh-CN": "故障" }
});

const pages = [
  "overview",
  "chat",
  "projects",
  "team",
  "agents",
  "tasks",
  "approvals",
  "memory",
  "timeline",
  "skills",
  "automations",
  "channels",
  "routing",
  "browser",
  "nodes",
  "integrations",
  "installation",
  "secrets",
  "settings",
] as const;

type Page = typeof pages[number];

interface NavGroup {
  labelKey: string;
  items: Array<{ id: Page; icon: string }>;
}

const navGroups: NavGroup[] = [
  {
    labelKey: "app.group.core",
    items: [
      { id: "chat", icon: "💬" },
      { id: "overview", icon: "📊" },
      { id: "projects", icon: "📂" },
    ],
  },
  {
    labelKey: "app.group.agents",
    items: [
      { id: "agents", icon: "🌲" },
      { id: "tasks", icon: "⚡" },
      { id: "approvals", icon: "🛡️" },
      { id: "timeline", icon: "📼" },
    ],
  },
  {
    labelKey: "app.group.knowledge",
    items: [
      { id: "memory", icon: "🧠" },
      { id: "skills", icon: "📜" },
      { id: "integrations", icon: "🔌" },
      { id: "secrets", icon: "🔐" },
    ],
  },
  {
    labelKey: "app.group.gateway",
    items: [
      { id: "channels", icon: "🌐" },
      { id: "automations", icon: "⏰" },
      { id: "routing", icon: "🔀" },
      { id: "browser", icon: "🌍" },
      { id: "nodes", icon: "🖥️" },
      { id: "installation", icon: "📦" },
      { id: "team", icon: "👥" },
      { id: "settings", icon: "⚙️" },
    ],
  },
];

function readPage(): Page {
  const value = location.hash.slice(1) as Page;
  return pages.includes(value) ? value : "overview";
}

function AppContent() {
  const { t } = useI18n();
  const [page, setPage] = useState<Page>(readPage);
  const [state, setState] = useState<WebState | null>(null);
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("corvus_sidebar_width");
    return saved ? Number(saved) : 240;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // UI Scale / Zoom State (persisted)
  const [zoom, setZoom] = useState<number>(() => {
    const saved = localStorage.getItem("corvus_ui_zoom");
    return saved ? Number(saved) : 100;
  });

  useEffect(() => {
    const scale = zoom / 100;
    if (zoom === 100) {
      (document.documentElement.style as any).zoom = "";
      document.documentElement.style.removeProperty("--ui-zoom");
    } else {
      (document.documentElement.style as any).zoom = String(scale);
      document.documentElement.style.setProperty("--ui-zoom", String(scale));
    }
    localStorage.setItem("corvus_ui_zoom", String(zoom));
  }, [zoom]);

  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    const startX = e.clientX;
    const startW = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(160, Math.min(480, startW + (moveEvent.clientX - startX)));
      setSidebarWidth(newWidth);
      document.documentElement.style.setProperty("--sidebar-width", `${newWidth}px`);
    };

    const onMouseUp = () => {
      setIsResizingSidebar(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setSidebarWidth((latest) => {
        localStorage.setItem("corvus_sidebar_width", String(latest));
        return latest;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const resetSidebarResize = () => {
    setSidebarWidth(240);
    localStorage.setItem("corvus_sidebar_width", "240");
    document.documentElement.style.setProperty("--sidebar-width", "240px");
  };

  const reload = useCallback(async () => {
    try {
      const [nextState, nextCapabilities] = await Promise.all([getState(), getRuntimeCapabilities()]);
      setState(nextState);
      setCapabilities(nextCapabilities);
      setAuthenticated(true);
      setError("");
    } catch (reason: any) {
      const msg = String(reason?.message || reason);
      if (msg.includes("Unauthorized") || msg.includes("401")) {
        setAuthenticated(false);
      } else {
        setError(msg);
        toast.error(msg);
      }
    }
  }, []);

  const handleLogout = () => {
    clearWebToken();
    setAuthenticated(false);
    setState(null);
    toast.info("已安全退出登录");
  };

  useEffect(() => {
    const route = () => setPage(readPage());
    const rejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setError(String(event.reason));
      toast.error(String(event.reason));
    };
    const runtimeError = (event: ErrorEvent) => {
      setError(event.message);
      toast.error(event.message);
    };

    window.addEventListener("hashchange", route);
    window.addEventListener("unhandledrejection", rejection);
    window.addEventListener("error", runtimeError);

    let reloadDebounce: any = null;
    const throttledReload = () => {
      if (reloadDebounce) return;
      reloadDebounce = setTimeout(() => {
        reloadDebounce = null;
        void reload();
      }, 500);
    };

    void reload();
    // 10-second background sync timer (supplemented by real-time SSE)
    const timer = setInterval(() => void reload(), 10000);

    const events = new EventSource(eventUrl("/api/events"));
    events.addEventListener("timeline", () => throttledReload());
    events.onerror = () => {
      // Reconnection managed natively by EventSource
    };

    return () => {
      window.removeEventListener("hashchange", route);
      window.removeEventListener("unhandledrejection", rejection);
      window.removeEventListener("error", runtimeError);
      clearInterval(timer);
      if (reloadDebounce) clearTimeout(reloadDebounce);
      events.close();
    };
  }, []);

  const navigate = (next: Page) => {
    location.hash = next;
    setPage(next);
  };

  if (authenticated === false) {
    return <LoginPage onLogin={() => { setAuthenticated(true); void reload(); }} />;
  }

  if (!state) {
    return (
      <div className="center">
        <TapeDeckReels active />
        <p>{error ? `[${t("app.fault")}] ${error}` : t("app.connecting")}</p>
      </div>
    );
  }

  const common = { state, reload, onToggleSidebar: () => setSidebarOpen((v) => !v) };
  const isCollaborator = state.currentUser?.role === "collaborator";
  const adminOnlyPages: Page[] = ["settings", "secrets", "installation", "nodes", "routing", "browser", "integrations", "team"];
  const enabledPages = pages.filter((item) => {
    if (isCollaborator && adminOnlyPages.includes(item)) return false;
    return capabilities?.pages.find((candidate) => candidate.id === item)?.enabled !== false;
  });
  if (!enabledPages.includes(page)) { queueMicrotask(() => navigate("chat")); }
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTaskCount = state.tasks.filter((t) => t.status === "running").length;
  const isRunning = activeTaskCount > 0;

  return (
    <div
      className={"shell " + (sidebarOpen ? "sidebar-open" : "")}
      style={{ gridTemplateColumns: `${sidebarWidth}px 4px minmax(0, 1fr)` }}
    >
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside>
        <div className="brand">
          <div className="brand-title">
            <b>{t("app.brand")}</b>
            <span className="brand-badge">{t("app.badge")}</span>
          </div>
          <span>{t("app.controlPlane")}</span>
        </div>
        <nav className="grouped-nav">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => enabledPages.includes(item.id));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.labelKey} className="nav-group-section">
                <div className="nav-group-header">{t(group.labelKey)}</div>
                {visibleItems.map((item) => {
                  const isApprovals = item.id === "approvals" && state.approvals.length > 0;
                  const isTasks = item.id === "tasks" && activeTaskCount > 0;
                  return (
                    <button
                      key={item.id}
                      className={page === item.id ? "active" : ""}
                      onClick={() => {
                        navigate(item.id);
                        setSidebarOpen(false);
                      }}
                    >
                      <span className="nav-item-title">
                        <span className="nav-icon">{item.icon}</span>
                        {t("app.page." + item.id)}
                      </span>
                      {isApprovals && <span className="nav-badge">{state.approvals.length}</span>}
                      {isTasks && <span className="nav-badge" style={{ background: "var(--amber)" }}>{activeTaskCount}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <footer>
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            <span>{t("app.local")}</span>
            <span>{t("app.projectsCount", { count: state.projects.length })}</span>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              marginTop: "8px",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              padding: "5px 8px",
              background: "rgba(255, 69, 58, 0.08)",
              border: "1px solid var(--border-mid)",
              color: "var(--text-muted)",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
            title="锁定并退出登录"
          >
            <span>🔒</span>
            <span>锁定 / 退出登录</span>
          </button>
        </footer>
      </aside>

      {/* Main Sidebar Resizer */}
      <div
        className={"sidebar-resizer " + (isResizingSidebar ? "resizing" : "")}
        onMouseDown={startSidebarResize}
        onDoubleClick={resetSidebarResize}
        title="拖动调整侧边栏宽度，双击恢复默认 (240px)"
      />

      <main className={page === "chat" ? "main chat-main" : "main"}>
        {page !== "chat" && (
          <header className="top">
            <div className="top-title-group">
              <button className="menu-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-label={t("app.menu")}>
                ☰
              </button>
              <div>
                <h1>
                  <span>{t("app.page." + page)}</span>
                </h1>
                <p title={activeProject?.path || t("app.noProject")}>
                  {activeProject ? t("app.activeTape", { name: activeProject.name, path: activeProject.path }) : t("app.noWorkspace")}
                </p>
              </div>
            </div>

            <div className="top-actions">
              {state.currentUser && (
                <span
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    padding: "3px 8px",
                    background: state.currentUser.role === "admin" ? "rgba(255, 122, 0, 0.12)" : "rgba(0, 240, 255, 0.12)",
                    border: state.currentUser.role === "admin" ? "1px solid var(--amber)" : "1px solid var(--vfd-cyan)",
                    color: state.currentUser.role === "admin" ? "var(--amber-bright)" : "var(--vfd-cyan)",
                    borderRadius: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  title={state.currentUser.role === "admin" ? "管理员账号" : "协同成员账号"}
                >
                  <span>{state.currentUser.role === "admin" ? "👑" : "🤝"}</span>
                  <b>{state.currentUser.username}</b>
                  <span style={{ fontSize: "10px", opacity: 0.8 }}>({state.currentUser.role === "admin" ? "管理员" : "协同成员"})</span>
                </span>
              )}

              {/* UI Scale / Zoom Controller */}
              <ZoomControl zoom={zoom} onZoomChange={setZoom} />

              <div className="transport-meter">
                <span className={"transport-led " + (isRunning ? "rec" : "play")}>
                  {t(isRunning ? "app.recording" : "app.playing")}
                </span>
                <TapeDeckReels active={isRunning} />
              </div>
              <button onClick={() => void reload()} title={t("app.refresh")}>
                {t("app.sync")}
              </button>
              <button
                onClick={handleLogout}
                title="锁定并退出登录"
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  padding: "3px 8px",
                  background: "#161822",
                  border: "1px solid var(--border-mid)",
                  color: "var(--amber)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                🔒 锁定
              </button>
            </div>
          </header>
        )}

        {error && (
          <div style={{ background: "#331212", borderBottom: "1px solid var(--led-red)", padding: "8px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#ffcdd2", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
            <span>[{t("app.fault")}] {error}</span>
            <button style={{ padding: "2px 8px", fontSize: "10px" }} onClick={() => setError("")}>
              {t("app.dismiss")}
            </button>
          </div>
        )}

        {page === "overview" && <OverviewPage {...common} />}
        {page === "chat" && <ChatPage {...common} />}
        {page === "projects" && <ProjectsPage {...common} />}
        {page === "agents" && <AgentsPage {...common} />}
        {page === "tasks" && <TasksPage {...common} />}
        {page === "approvals" && <ApprovalsPage {...common} />}
        {page === "memory" && <MemoryPage {...common} />}
        {page === "timeline" && <TimelinePage {...common} />}
        {page === "skills" && <SkillsPage {...common} />}
        {page === "automations" && <AutomationsPage {...common} />}
        {page === "channels" && <ChannelsPage {...common} />}
        {page === "routing" && <RoutingPage {...common} />}
        {page === "browser" && <BrowserPage />}
        {page === "nodes" && <NodesPage />}
        {page === "integrations" && <IntegrationsPage {...common} />}
        {page === "installation" && <InstallationPage />}
        {page === "secrets" && <SecretsPage />}
        {page === "team" && <TeamPage {...common} />}
        {page === "settings" && <SettingsPage {...common} />}
      </main>

      <ToastContainer />
    </div>
  );
}

export function App() {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => { getState().then((state) => setLocale(state.webLocale ?? "en")).catch(() => undefined); }, []);
  return <I18nProvider initialLocale={locale} onLocaleChange={async (next) => { setLocale(next); await postJson("/api/config", { webLocale: next }); }}><AppContent /></I18nProvider>;
}
