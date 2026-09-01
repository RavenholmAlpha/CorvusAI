import React, { useEffect, useRef, useState } from "react";
import { handleApprovalChoice } from "./approval-flow.js";
import { Box, Text, useInput, useApp } from "ink";
import type { RuntimeStateManager, RuntimeState } from "../runtime-state.js";
import { StreamWorkbench } from "./StreamWorkbench.js";
import { ControlDashboard } from "./ControlDashboard.js";
import { SetupWizard } from "./SetupWizard.js";
import { CommandDeck } from "./CommandDeck.js";
import { ApprovalPage, ContextPage, ProjectsPage, ProvidersPage, RolesPage, RunsPage, SettingsPage, TasksPage, ToolsPage } from "./WorkbenchPages.js";
import { RoleEditor } from "./RoleEditor.js";
import type { AgentRole } from "../config.js";
import { ProviderEditor } from "./ProviderEditor.js";
import type { ProviderProfile } from "../config.js";
import type { CorvusAgent } from "../agent.js";
import type { CorvusConfig } from "../config.js";
import type { CommandRegistry, DurableHarnessAdapter } from "../commands.js";
import type { ToolRegistry } from "../tools/index.js";
import { ui, setTheme, cycleTheme, getActiveThemeName } from "./theme.js";

export interface AppProps {
  stateManager: RuntimeStateManager;
  agent: CorvusAgent;
  config: CorvusConfig;
  commands?: CommandRegistry;
  tools?: ToolRegistry;
  harness?: DurableHarnessAdapter;
  plugins?: Array<{ name: string; version: string; status: string }>;
  saveConfig?: () => Promise<void>;
  activeProjectId?: string;
  selectProject?: (projectId: string) => Promise<boolean>;
}

export function App({ stateManager, agent, config, commands, tools, harness, plugins, saveConfig, activeProjectId, selectProject }: AppProps) {
  const [state, setState] = useState<RuntimeState>(stateManager.get());
  const cancelRef = useRef<(() => void) | null>(null);
  const { exit } = useApp();
  const pendingApprovals = harness?.listPendingApprovals() ?? [];
  const [approvalIndex, setApprovalIndex] = useState(0);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderProfile | null>(null);
  const [editingRole, setEditingRole] = useState<AgentRole | null>(null);
  const [, setApprovalTick] = useState(0);
  const NAV_ITEMS = ["Workspace", "Projects", "Approvals", "Tasks", "Runs", "Context", "Settings", "Providers", "Tools"] as const;
  const pageTasks = harness?.listSubagentTasks?.(agent.activeSessionId()) ?? [];
  const pageRuns = [...(harness?.listRuns() ?? [])].reverse();

  useEffect(() => {
    const handleChange = (newState: RuntimeState) => {
      setState(newState);
      if (newState.mode === "line") {
        exit();
      }
    };
    stateManager.on("change", handleChange);
    return () => {
      stateManager.off("change", handleChange);
    };
  }, [stateManager, exit]);

  const resolveGlobalApproval = async (choice: "allow once" | "always" | "deny") => {
    const approval = pendingApprovals[approvalIndex];
    if (!approval || !harness || approvalBusy) return;
    setApprovalBusy(true);
    try {
      await handleApprovalChoice(choice, { approvalId: approval.id, toolCallId: approval.toolCallId, toolName: approval.toolName }, { harness, tools, config, saveConfig });
      if (harness.resumeRun) await harness.resumeRun(approval.runId);
      setApprovalIndex((index) => Math.max(0, Math.min(index, Math.max(0, (harness.listPendingApprovals().length - 1)))));
    } catch (error) {
      // Durable state remains visible; the user can retry from the center.
    } finally {
      setApprovalBusy(false);
      setApprovalTick((tick) => tick + 1);
    }
  };

  const activateNavigationItem = (index: number) => {
    const item = NAV_ITEMS[index];
    if (item === "Workspace") stateManager.setActivePage("workspace");
    if (item === "Projects") stateManager.setActivePage("projects");
    if (item === "Approvals") stateManager.setActivePage("approvals");
    if (item === "Tasks") stateManager.setActivePage("tasks");
    if (item === "Runs") stateManager.setActivePage("runs");
    if (item === "Context") stateManager.setActivePage("context");
    if (item === "Settings") stateManager.setActivePage("settings");
    if (item === "Providers") stateManager.setActivePage("providers");
    if (item === "Tools") stateManager.setActivePage("tools");
    stateManager.toggleNavigation(false);
  };

  const mainProvider = config.mainProviderId ? config.providers?.[config.mainProviderId] : undefined;
  const activeModelLabel = mainProvider?.defaultModel ?? config.model;
  const [currentProjectId, setCurrentProjectId] = useState(activeProjectId ?? "");
  const pageProjects = harness?.listProjects?.() ?? [];
  const displayedProjectId = currentProjectId || pageProjects[0]?.id || "";
  const pageProviders = Object.values(config.providers ?? {});
  const contentLength = state.activePage === "projects" ? pageProjects.length : state.activePage === "tasks" ? pageTasks.length : state.activePage === "runs" ? pageRuns.length : state.activePage === "settings" ? 5 : state.activePage === "providers" ? pageProviders.length : 0;
  const activateContentItem = () => {
    if (state.activePage === "projects") {
      const selected = pageProjects[state.contentIndex];
      if (selected && selectProject) void selectProject(selected.id).then((ok) => { if (ok) { setCurrentProjectId(selected.id); stateManager.setActivePage("workspace"); } });
    }
    if (state.activePage === "tasks") {
      const task = pageTasks[state.contentIndex];
      if (task) stateManager.setDetailOverlay("task", task.id);
    }
    if (state.activePage === "runs") {
      const run = pageRuns[state.contentIndex];
      if (run) stateManager.setDetailOverlay("run", run.id);
    }
  };
  const cancelSelectedTask = () => {
    const task = pageTasks[state.contentIndex];
    if (task) harness?.cancelSubagentTask?.(task.id);
    setApprovalTick((tick) => tick + 1);
  };
  const resumeSelectedRun = () => {
    const run = pageRuns[state.contentIndex];
    if (run && harness?.resumeRun) {
      void Promise.resolve(harness.resumeRun(run.id)).finally(() => setApprovalTick((tick) => tick + 1));
    }
  };
  const handleSettingsAction = (action: string) => {
    if (action === "providers") { stateManager.setActivePage("providers"); return; }
    if (action === "roles") { stateManager.setActivePage("roles"); return; }
    if (action === "back") { stateManager.goBack(); return; }
    if (action === "permissions") { stateManager.setMode("dashboard"); stateManager.setDashboardSection("permissions"); return; }
    const index = action === "theme" ? 0 : action === "review" ? 1 : action === "rounds" ? 2 : 3;
    stateManager.setContentIndex(index);
    activateSetting();
  };
  const handleProviderAction = (action: string) => {
    if (action === "back") { stateManager.goBack(); return; }
    if (action === "add") {
      const id = "provider-" + Date.now();
      const currentMain = config.mainProviderId ? config.providers?.[config.mainProviderId] : undefined;
      setEditingProvider({ id, label: "New provider", protocol: currentMain?.protocol ?? "openai-chat", endpoint: currentMain?.endpoint ?? config.endpoint, apiKey: currentMain?.apiKey || config.apiKey, models: [currentMain?.defaultModel ?? config.model], defaultModel: currentMain?.defaultModel ?? config.model, temperature: currentMain?.temperature ?? config.temperature });
      return;
    }
    if (action.startsWith("edit:")) { const provider = config.providers?.[action.slice(5)]; if (provider) setEditingProvider(provider); return; }
    if (action.startsWith("main:")) { const id = action.slice(5); if (config.providers?.[id]) { config.mainProviderId = id; void saveConfig?.().finally(() => setApprovalTick((tick) => tick + 1)); } return; }
    if (action.startsWith("delete:")) { const id = action.slice(7); const { [id]: _removed, ...rest } = config.providers ?? {}; config.providers = rest; if (config.mainProviderId === id) config.mainProviderId = undefined; void saveConfig?.().finally(() => setApprovalTick((tick) => tick + 1)); }
  };
  const handleRoleAction = (action: string) => {
    if (action === "back") { stateManager.goBack(); return; }
    if (action === "add") {
      const provider = Object.values(config.providers ?? {})[0];
      if (!provider) { stateManager.setActivePage("providers"); return; }
      setEditingRole({ id: "role-" + Date.now(), label: "New agent role", providerId: provider.id, model: provider.defaultModel, temperature: provider.temperature ?? config.temperature });
      return;
    }
    if (action.startsWith("edit:")) { const role = config.agentRoles?.[action.slice(5)]; if (role) setEditingRole(role); return; }
    if (action.startsWith("delete:")) { const id = action.slice(7); const { [id]: _removed, ...rest } = config.agentRoles ?? {}; config.agentRoles = rest; void saveConfig?.().finally(() => setApprovalTick((tick) => tick + 1)); }
  };

  const activateSetting = () => {
    if (state.contentIndex === 0) { config.theme = cycleTheme(); }
    if (state.contentIndex === 1) { config.review.enabled = !config.review.enabled; }
    if (state.contentIndex === 2) { config.maxToolRounds = config.maxToolRounds === 0 ? 50 : 0; }
    if (state.contentIndex === 3) {
      const values = [128_000, 256_000, 512_000, 1_000_000];
      const currentIndex = Math.max(0, values.indexOf(config.contextWindowTokens));
      const next = values[(currentIndex + 1) % values.length];
      config.contextWindowTokens = next;
      config.compactionThreshold = Math.round(next * 0.7);
    }
    void saveConfig?.().finally(() => setApprovalTick((tick) => tick + 1));
  };

  useEffect(() => {
    const timer = setInterval(() => setApprovalTick((tick) => tick + 1), 500);
    return () => clearInterval(timer);
  }, []);
  useInput((input, key) => {
    if (editingProvider || editingRole) return;
    if (state.detailOverlay !== "none") {
      if (key.escape) { stateManager.setDetailOverlay("none", null); return; }
      if (input.toLowerCase() === "c" && state.detailOverlay === "task") { cancelSelectedTask(); return; }
      if (input.toLowerCase() === "r" && state.detailOverlay === "run") { resumeSelectedRun(); return; }
      return;
    }
    if (state.approvalCenterOpen) {
      if (key.escape) { stateManager.toggleApprovalCenter(false); return; }
      if (key.upArrow) { setApprovalIndex((index) => Math.max(0, index - 1)); return; }
      if (key.downArrow) { setApprovalIndex((index) => Math.min(Math.max(0, pendingApprovals.length - 1), index + 1)); return; }
      if (input === "1") { void resolveGlobalApproval("allow once"); return; }
      if (input === "2") { void resolveGlobalApproval("always"); return; }
      if (input === "3") { void resolveGlobalApproval("deny"); return; }
      return;
    }
    if (state.navigationOpen) {
      if (key.escape) { stateManager.toggleNavigation(false); return; }
      if (key.upArrow) { stateManager.setNavigationIndex((state.navigationIndex + NAV_ITEMS.length - 1) % NAV_ITEMS.length); return; }
      if (key.downArrow) { stateManager.setNavigationIndex((state.navigationIndex + 1) % NAV_ITEMS.length); return; }
      if (key.return) { activateNavigationItem(state.navigationIndex); return; }
      if (input.toLowerCase() === "a") { stateManager.toggleApprovalCenter(true); return; }
      return;
    }
    if (state.inputMode === "navigation") {
      // Settings and Providers own their SelectInput focus; App must not steal arrows.
      if (state.activePage === "settings" || state.activePage === "providers" || state.activePage === "roles") {
        if (key.leftArrow || key.escape) {
          if (state.activePage !== "settings") stateManager.goBack();
          else stateManager.setFocusedPane("nav");
          return;
        }
        return;
      }
      if (input.toLowerCase() === "i" && state.activePage === "workspace") { stateManager.setInputMode("compose"); return; }
      if (key.leftArrow) { stateManager.setFocusedPane("nav"); return; }
      if (key.rightArrow) { stateManager.setFocusedPane("panel"); return; }
      if (state.focusedPane === "panel" && contentLength > 0) {
        if (key.upArrow) { stateManager.setContentIndex((state.contentIndex + contentLength - 1) % contentLength); return; }
        if (key.downArrow) { stateManager.setContentIndex((state.contentIndex + 1) % contentLength); return; }
        if (key.return) { activateContentItem(); return; }
        if (input.toLowerCase() === "c" && state.activePage === "tasks") { cancelSelectedTask(); return; }
        if (input.toLowerCase() === "r" && state.activePage === "runs") { resumeSelectedRun(); return; }
      }
      if (key.upArrow) { stateManager.setNavigationIndex((state.navigationIndex + NAV_ITEMS.length - 1) % NAV_ITEMS.length); return; }
      if (key.downArrow) { stateManager.setNavigationIndex((state.navigationIndex + 1) % NAV_ITEMS.length); return; }
      if (key.return) { activateNavigationItem(state.navigationIndex); return; }
      if (input.toLowerCase() === "a") { stateManager.toggleApprovalCenter(true); return; }
      if (input.toLowerCase() === "t") { stateManager.setActivePage("tasks"); return; }
      if (input.toLowerCase() === "r") { stateManager.setActivePage("runs"); return; }
      if (input.toLowerCase() === "g") { stateManager.setActivePage("context"); return; }
      if (input.toLowerCase() === "s") { stateManager.setActivePage("settings"); return; }
      return;
    }
    // Compose mode: character input belongs to TextInput.
    if (key.escape) {
      if (state.commandDeckOpen) {
        stateManager.toggleCommandDeck();
        return;
      }
      // Leave text entry without interrupting the active agent.
      if (state.mode !== "setup") {
        stateManager.setInputMode("navigation");
        return;
      }
      stateManager.setMode("line");
      return;
    }
    if (key.ctrl && input === "l") {
      stateManager.setMode("line");
      return;
    }
    if (key.ctrl && input === "c") {
      stateManager.requestExit();
      stateManager.setMode("line");
      return;
    }
    if (key.ctrl && input === "k") {
      stateManager.toggleCommandDeck();
      return;
    }
    if (input === "\u001bOP" || input === "\x1b[11~") {
      // F1
      return;
    }
    if (input === "\u001bOQ" || input === "\x1b[12~") {
      // F2 Stream
      stateManager.setMode("stream");
      return;
    }
    if (input === "\u001bOR" || input === "\x1b[13~") {
      // F3 Dashboard
      stateManager.setMode("dashboard");
      return;
    }
    if (input === "\u001bOS" || input === "\x1b[14~") {
      // F4 Settings
      stateManager.setMode("dashboard");
      stateManager.setDashboardSection("settings");
      return;
    }
    if (input === "\x1b[15~") {
      // F5 Tools
      stateManager.setMode("dashboard");
      stateManager.setDashboardSection("tools");
    }
  });

  return (
    <Box flexDirection="column" width="100%" height={process.stdout.rows || 24} overflow="hidden">
      {/* Top Status Bar shared across all workbench modes */}
      <Box borderStyle="single" borderColor={ui.panelBorder} paddingX={1} justifyContent="space-between" flexShrink={0}>
        <Text bold color={ui.brand}>
          CORVUS <Text color="white">Workbench</Text>
        </Text>
        <Text color={ui.muted}>
          {(() => {
            const ratio = state.contextUsage && state.contextUsage.contextWindow > 0
              ? state.contextUsage.lastRequestTokens / state.contextUsage.contextWindow : 0;
            const dotColor = state.contextUsage?.isCompacting ? ui.accent : ratio > 0.7 ? ui.danger : ui.success;
            const meter = state.contextUsage
              ? "█".repeat(Math.max(0, Math.min(6, Math.round(ratio * 6)))) + "░".repeat(6 - Math.max(0, Math.min(6, Math.round(ratio * 6))))
              : "░░░░░░";
            return (
              <>
                <Text color={dotColor}>{"● "}</Text>
                <Text color={ui.muted}>{state.mode.toUpperCase()}</Text>
                <Text color={ui.muted}>{" · "}</Text>
                {activeModelLabel}
                {mainProvider ? " · " + mainProvider.protocol : ""}
                {pendingApprovals.length > 0 ? " · APRV " + pendingApprovals.length : ""}
                {state.contextUsage
                  ? ` · CTX ${meter} ${(state.contextUsage.lastRequestTokens / 1000).toFixed(1)}K/${(state.contextUsage.contextWindow / 1000).toFixed(0)}K`
                  : ""}
              </>
            );
          })()}
        </Text>
        <Text color={ui.muted}>{state.inputMode === "compose" ? "Esc:NAV · Ctrl+L:Line · Ctrl+C:Exit" : "i:Compose · ↑↓:Navigate · a:Approvals · Ctrl+L:Line"}</Text>
      </Box>

      {/* Persistent AppShell: navigation never stops background agents. */}
      <Box flexGrow={1} minHeight={0} flexDirection="row" overflow="hidden">
        <Box width="20%" minWidth={18} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column" overflow="hidden">
          <Text bold color={ui.brand}>CONTROL</Text>
          <Text color={ui.muted}>↑↓ in NAV · Enter open</Text>
          <Box marginTop={1} flexDirection="column">
            {(["workspace", "approvals", "tasks", "runs", "context", "settings", "providers", "tools"] as const).map((page) => (
              <Text key={page} color={state.focusedPane === "nav" && state.navigationIndex === (["workspace", "approvals", "tasks", "runs", "context", "settings", "providers", "tools"] as const).indexOf(page) ? ui.accent : state.activePage === page ? "white" : ui.muted}>
                {state.focusedPane === "nav" && state.navigationIndex === (["workspace", "approvals", "tasks", "runs", "context", "settings", "providers", "tools"] as const).indexOf(page) ? "▸ " : state.activePage === page ? "• " : "  "}{page.toUpperCase()}{page === "approvals" && pendingApprovals.length > 0 ? " (" + pendingApprovals.length + ")" : ""}
              </Text>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text color={ui.muted}>Esc NAV · i compose · a approvals</Text>
          </Box>
        </Box>
        <Box flexGrow={1} minHeight={0} flexDirection="column" overflow="hidden">
          {state.activePage === "projects" && <ProjectsPage projects={pageProjects} activeProjectId={displayedProjectId} onAction={(action) => { if (action === "back") stateManager.goBack(); }} onBack={() => stateManager.goBack()} />}
          {state.activePage === "workspace" && (
            <StreamWorkbench
              state={state} agent={agent} config={config} commands={commands} tools={tools} harness={harness}
              plugins={plugins} saveConfig={saveConfig} runtimeState={stateManager} cancelRef={cancelRef}
            />
          )}
          {state.activePage === "approvals" && <ApprovalPage harness={harness} />}
          {state.activePage === "tasks" && <TasksPage agent={agent} harness={harness} state={state} />}
          {state.activePage === "runs" && <RunsPage harness={harness} state={state} />}
          {state.activePage === "context" && <ContextPage agent={agent} />}
          {state.activePage === "settings" && <SettingsPage config={config} onAction={handleSettingsAction} onBack={() => stateManager.goBack()} />}
          {state.activePage === "providers" && <ProvidersPage config={config} onAction={handleProviderAction} onBack={() => stateManager.goBack()} />}
          {state.activePage === "roles" && <RolesPage config={config} onAction={handleRoleAction} onBack={() => stateManager.goBack()} />}
          {state.activePage === "tools" && <ToolsPage tools={tools} />}
          {state.mode === "setup" && <SetupWizard state={state} manager={stateManager} config={config} saveConfig={saveConfig} />}
        </Box>
      </Box>

      {state.navigationOpen && (
        <Box position="absolute" top="15%" left="3%" width="28%" borderStyle="round" borderColor={ui.accent} backgroundColor="black" padding={1} flexDirection="column">
          <Text bold color={ui.accent}>NAVIGATION</Text>
          <Text color={ui.muted}>↑↓ select · Enter open · a approvals · Esc close</Text>
          <Box marginTop={1} flexDirection="column">
            {NAV_ITEMS.map((item, index) => (
              <Text key={item} color={index === state.navigationIndex ? ui.accent : ui.muted}>
                {index === state.navigationIndex ? "▸ " : "  "}{item}{item === "Approvals" && pendingApprovals.length > 0 ? " (" + pendingApprovals.length + ")" : ""}
              </Text>
            ))}
          </Box>
        </Box>
      )}
      {editingProvider && <ProviderEditor
        initial={editingProvider}
        onCancel={() => setEditingProvider(null)}
        onSave={(provider) => {
          const oldId = editingProvider.id;
          const providers = { ...(config.providers ?? {}) };
          if (oldId !== provider.id) delete providers[oldId];
          providers[provider.id] = provider;
          config.providers = providers;
          // Editing and adding providers never changes the live main model implicitly.
          if (config.mainProviderId === oldId) config.mainProviderId = provider.id;
          setEditingProvider(null);
          void saveConfig?.().finally(() => setApprovalTick((tick) => tick + 1));
        }}
      />}

      {editingRole && <RoleEditor
        initial={editingRole}
        providers={Object.values(config.providers ?? {})}
        onCancel={() => setEditingRole(null)}
        onSave={(role) => {
          const oldId = editingRole.id;
          const roles = { ...(config.agentRoles ?? {}) };
          if (oldId !== role.id) delete roles[oldId];
          roles[role.id] = role;
          config.agentRoles = roles;
          setEditingRole(null);
          void saveConfig?.().finally(() => setApprovalTick((tick) => tick + 1));
        }}
      />}

      {state.detailOverlay === "task" && (() => {
        const task = pageTasks.find((item) => item.id === state.selectedItemId);
        if (!task) return null;
        const color = task.status === "succeeded" ? ui.success : task.status === "failed" ? ui.danger : ui.accent;
        return <Box position="absolute" top="18%" left="22%" width="56%" borderStyle="round" borderColor={color} backgroundColor="black" padding={1} flexDirection="column">
          <Text bold color={color}>TASK DETAIL · {task.status.toUpperCase()}</Text>
          <Text color={ui.muted}>Esc close · c cancel task</Text>
          <Text>Task: {task.id}</Text>
          <Text>Profile: {task.modelProfile ?? "default"} · Depth: {task.depth} · Created: {task.createdAt}</Text>
          <Text>Parent session: {task.parentSessionId}</Text>
          <Text>Child session: {task.childSessionId}</Text>
          <Text>Parent run: {task.parentRunId ?? "(none)"}</Text>
          <Text>Description: {task.description ?? "(none)"}</Text>
          <Text>Prompt: {task.prompt}</Text>
          {task.error && <Text color={ui.danger}>Error: {task.error}</Text>}
        </Box>;
      })()}
      {state.detailOverlay === "run" && (() => {
        const run = pageRuns.find((item) => item.id === state.selectedItemId);
        if (!run) return null;
        const messages = harness?.listMessages(run.id) ?? [];
        const color = run.status === "succeeded" ? ui.success : run.status === "failed" ? ui.danger : ui.accent;
        return <Box position="absolute" top="18%" left="22%" width="56%" borderStyle="round" borderColor={color} backgroundColor="black" padding={1} flexDirection="column">
          <Text bold color={color}>RUN DETAIL · {run.status.toUpperCase()}</Text>
          <Text color={ui.muted}>Esc close · r resume run</Text>
          <Text>Run: {run.id}</Text>
          <Text>Goal: {run.goal}</Text>
          <Text>Model: {run.model} · Endpoint: {run.endpoint}</Text>
          <Text>Session: {run.sessionId ?? "(none)"}</Text>
          <Text>Created: {run.createdAt} · Updated: {run.updatedAt}</Text>
          <Text>Messages: {messages.length} · Evidence: {harness?.listEvidence(run.id).length ?? 0}</Text>
        </Box>;
      })()}

      {state.approvalCenterOpen && (
        <Box position="absolute" top="10%" left="18%" width="64%" height="80%" borderStyle="round" borderColor={ui.accent} backgroundColor="black" padding={1} flexDirection="column" overflow="hidden">
          <Text bold color={ui.accent}>APPROVAL CENTER · {pendingApprovals.length} pending</Text>
          <Text color={ui.muted}>↑↓ select · 1 Allow once · 2 Always · 3 Deny · Esc close</Text>
          <Box marginTop={1} flexDirection="column" overflow="hidden">
            {pendingApprovals.length === 0 ? (
              <Text color={ui.success}>No pending approvals.</Text>
            ) : (
              pendingApprovals.map((approval, index) => (
                <Box key={approval.id} borderStyle={index === approvalIndex ? "single" : undefined} borderColor={ui.accent} paddingX={1} flexDirection="column">
                  <Text color={index === approvalIndex ? ui.accent : "white"}>
                    {index === approvalIndex ? "▸ " : "  "}{approval.toolName ?? "unknown tool"} · run {approval.runId.slice(0, 18)}
                  </Text>
                  <Text color={ui.muted}>approval {approval.id.slice(0, 18)} · tool call {approval.toolCallId.slice(0, 18)}</Text>
                </Box>
              ))
            )}
          </Box>
          {approvalBusy && <Text color={ui.accent}>Applying decision and resuming run…</Text>}
        </Box>
      )}

      {/* Command Deck Overlay */}
      {state.commandDeckOpen && (
        <Box
          position="absolute"
          top="10%"
          left="20%"
          width="60%"
          height="80%"
          borderStyle="round"
          borderColor="blue"
          backgroundColor="black"
        >
          <CommandDeck state={state} manager={stateManager} />
        </Box>
      )}
    </Box>
  );
}
