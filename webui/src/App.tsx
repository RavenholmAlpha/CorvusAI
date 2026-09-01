import React, { useEffect, useState } from "react";
import { eventUrl, getRuntimeCapabilities, getState, type RuntimeCapabilities } from "./api";
import type { WebState } from "./types";
import { TapeDeckReels, ToastContainer, toast } from "./components";
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

const pages = [
  "overview",
  "chat",
  "projects",
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
  label: string;
  items: Array<{ id: Page; title: string; icon: string }>;
}

const navGroups: NavGroup[] = [
  {
    label: "CORE WORKBENCH",
    items: [
      { id: "chat", title: "CHAT CONTROL", icon: "💬" },
      { id: "overview", title: "OVERVIEW", icon: "📊" },
      { id: "projects", title: "PROJECTS", icon: "📂" },
    ],
  },
  {
    label: "AGENTS & EXECUTION",
    items: [
      { id: "agents", title: "HIERARCHY", icon: "🌲" },
      { id: "tasks", title: "TASKS", icon: "⚡" },
      { id: "approvals", title: "APPROVALS", icon: "🛡️" },
      { id: "timeline", title: "TIMELINE", icon: "📼" },
    ],
  },
  {
    label: "KNOWLEDGE & EXT",
    items: [
      { id: "memory", title: "MEMORY", icon: "🧠" },
      { id: "skills", title: "SKILLS", icon: "📜" },
      { id: "integrations", title: "MCP & PLUGINS", icon: "🔌" },
      { id: "secrets", title: "SECRETS", icon: "🔐" },
    ],
  },
  {
    label: "GATEWAY & CONFIG",
    items: [
      { id: "channels", title: "CHANNELS", icon: "🌐" },
      { id: "automations", title: "AUTOMATIONS", icon: "⏰" },
      { id: "routing", title: "ROUTING", icon: "🔀" },
      { id: "browser", title: "BROWSER", icon: "🌍" },
      { id: "nodes", title: "NODES", icon: "🖥️" },
      { id: "installation", title: "BUNDLES", icon: "📦" },
      { id: "settings", title: "SETTINGS", icon: "⚙️" },
    ],
  },
];

function readPage(): Page {
  const value = location.hash.slice(1) as Page;
  return pages.includes(value) ? value : "overview";
}

export function App() {
  const [page, setPage] = useState<Page>(readPage);
  const [state, setState] = useState<WebState | null>(null);
  const [error, setError] = useState("");
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const reload = async () => {
    try {
      const [nextState, nextCapabilities] = await Promise.all([getState(), getRuntimeCapabilities()]);
      setState(nextState);
      setCapabilities(nextCapabilities);
      setError("");
    } catch (reason) {
      setError(String(reason));
      toast.error(String(reason));
    }
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

  if (!state) {
    return (
      <div className="center">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <TapeDeckReels active />
          <span>CONNECTING TO CORVUS DECK-01...</span>
          {error && <span style={{ color: "var(--led-red)", fontSize: "12px" }}>{error}</span>}
        </div>
      </div>
    );
  }

  const common = { state, reload, onToggleSidebar: () => setSidebarOpen((v) => !v) };
  const enabledPages = pages.filter((item) => capabilities?.pages.find((candidate) => candidate.id === item)?.enabled !== false);
  if (!enabledPages.includes(page)) { queueMicrotask(() => navigate("installation")); }
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTaskCount = state.tasks.filter((t) => t.status === "running").length;
  const isRunning = activeTaskCount > 0;

  return (
    <div className={"shell " + (sidebarOpen ? "sidebar-open" : "")}>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside>
        <div className="brand">
          <div className="brand-title">
            <b>CORVUS</b>
            <span className="brand-badge">C-90 TAPE</span>
          </div>
          <span>DECK-01 // CONTROL PLANE</span>
        </div>
        <nav className="grouped-nav">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => enabledPages.includes(item.id));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label} className="nav-group-section">
                <div className="nav-group-header">{group.label}</div>
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
                        {item.title}
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
          <span>LOCAL // STEREO</span>
          <span>{state.projects.length} PROJECTS</span>
        </footer>
      </aside>

      <main className={page === "chat" ? "main chat-main" : "main"}>
        {page !== "chat" && (
          <header className="top">
            <div className="top-title-group">
              <button className="menu-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-label="Toggle Navigation Menu">
                ☰
              </button>
              <div>
                <h1>
                  <span>{page.toUpperCase()}</span>
                </h1>
                <p title={activeProject?.path || "No active project"}>
                  {activeProject ? `[TAPE: ${activeProject.name}] ${activeProject.path}` : "NO ACTIVE WORKSPACE"}
                </p>
              </div>
            </div>

            <div className="top-actions">
              <div className="transport-meter">
                <span className={"transport-led " + (isRunning ? "rec" : "play")}>
                  {isRunning ? "REC ●" : "PLAY ▶"}
                </span>
                <TapeDeckReels active={isRunning} />
              </div>
              <button onClick={() => void reload()} title="Refresh system state">
                SYNC
              </button>
            </div>
          </header>
        )}

        {error && (
          <div style={{ background: "#331212", borderBottom: "1px solid var(--led-red)", padding: "8px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#ffcdd2", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
            <span>[FAULT] {error}</span>
            <button style={{ padding: "2px 8px", fontSize: "10px" }} onClick={() => setError("")}>
              DISMISS
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
        {page === "settings" && <SettingsPage {...common} />}
      </main>

      <ToastContainer />
    </div>
  );
}