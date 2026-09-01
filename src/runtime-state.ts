import { EventEmitter } from "node:events";
import type { ContextUsage } from "./context.js";

export type UIMode = "line" | "stream" | "dashboard" | "setup";
export type DashboardSection = "setup" | "settings" | "permissions" | "tools" | "plugins" | "diagnostics";
export type WorkbenchPage = "workspace" | "projects" | "approvals" | "tasks" | "runs" | "context" | "settings" | "providers" | "roles" | "tools";
export type InputMode = "navigation" | "compose";

export interface SetupStatus {
  hasConfig: boolean;
  endpointValid: boolean;
  modelConfigured: boolean;
  apiKeyEnvValid: boolean;
  apiKeyEnvPresent: boolean;
  pluginDirExists: boolean;
  pluginsLoaded: boolean;
  permissionPolicyValid: boolean;
  reviewModeConfigured: boolean;
}

export type ToolActivityStatus = "running" | "succeeded" | "failed";

export interface ToolActivity {
  id: string;
  toolName: string;
  status: ToolActivityStatus;
  startedAt: number;
  elapsedMs?: number;
  detail?: string;
}

const MAX_TOOL_ACTIVITY = 20;

export interface RuntimeState {
  mode: UIMode;
  exitRequested: boolean;
  dashboardSection: DashboardSection;
  commandDeckOpen: boolean;
  approvalCenterOpen: boolean;
  navigationOpen: boolean;
  navigationIndex: number;
  activePage: WorkbenchPage;
  pageHistory: WorkbenchPage[];
  contentIndex: number;
  inputMode: InputMode;
  focusedPane: "stream" | "inspector" | "nav" | "panel";
  selectedItemId: string | null;
  detailOverlay: "none" | "task" | "run";
  setupStatus: SetupStatus | null;
  warnings: string[];
  approvalQueue: any[];
  evidenceItems: any[];
  recentDecisions: any[];
  toolActivity: ToolActivity[];
  contextUsage?: ContextUsage;
}

export const defaultSetupStatus: SetupStatus = {
  hasConfig: false,
  endpointValid: false,
  modelConfigured: false,
  apiKeyEnvValid: false,
  apiKeyEnvPresent: false,
  pluginDirExists: false,
  pluginsLoaded: false,
  permissionPolicyValid: false,
  reviewModeConfigured: false,
};

export const defaultRuntimeState: RuntimeState = {
  mode: "line",
  exitRequested: false,
  dashboardSection: "setup",
  commandDeckOpen: false,
  approvalCenterOpen: false,
  navigationOpen: false,
  navigationIndex: 0,
  activePage: "workspace",
  pageHistory: [],
  contentIndex: 0,
  inputMode: "navigation",
  focusedPane: "nav",
  selectedItemId: null,
  detailOverlay: "none",
  setupStatus: null,
  warnings: [],
  approvalQueue: [],
  evidenceItems: [],
  recentDecisions: [],
  toolActivity: [],
  contextUsage: undefined,
};

export class RuntimeStateManager extends EventEmitter {
  private state: RuntimeState;

  constructor(initialState: Partial<RuntimeState> = {}) {
    super();
    this.state = { ...defaultRuntimeState, ...initialState };
  }

  get(): RuntimeState {
    return this.state;
  }

  update(partial: Partial<RuntimeState>): void {
    this.state = { ...this.state, ...partial };
    this.emit("change", this.state);
  }

  setMode(mode: UIMode): void {
    this.update({ mode, commandDeckOpen: false });
  }

  toggleCommandDeck(): void {
    this.update({ commandDeckOpen: !this.state.commandDeckOpen });
  }

  toggleApprovalCenter(open?: boolean): void {
    this.update({ approvalCenterOpen: open ?? !this.state.approvalCenterOpen, navigationOpen: false });
  }

  toggleNavigation(open?: boolean): void {
    this.update({ navigationOpen: open ?? !this.state.navigationOpen, approvalCenterOpen: false });
  }

  setNavigationIndex(index: number): void {
    this.update({ navigationIndex: Math.max(0, index) });
  }

  setActivePage(activePage: WorkbenchPage, replace = false): void {
    const dashboardSection = activePage === "settings" ? "settings" : activePage === "tools" ? "tools" : this.state.dashboardSection;
    const pageHistory = replace || activePage === this.state.activePage ? this.state.pageHistory : [...this.state.pageHistory, this.state.activePage];
    this.update({ activePage, pageHistory, dashboardSection, mode: activePage === "settings" || activePage === "tools" ? "dashboard" : "stream", navigationOpen: false, inputMode: "navigation", contentIndex: 0 });
  }

  goBack(): void {
    const pageHistory = [...this.state.pageHistory];
    const activePage = pageHistory.pop() ?? "workspace";
    const dashboardSection = activePage === "settings" ? "settings" : activePage === "tools" ? "tools" : this.state.dashboardSection;
    this.update({ activePage, pageHistory, dashboardSection, mode: activePage === "settings" || activePage === "tools" ? "dashboard" : "stream", navigationOpen: false, inputMode: "navigation", contentIndex: 0 });
  }

  setContentIndex(contentIndex: number): void {
    this.update({ contentIndex: Math.max(0, contentIndex) });
  }

  setFocusedPane(focusedPane: RuntimeState["focusedPane"]): void {
    this.update({ focusedPane });
  }

  setDetailOverlay(detailOverlay: RuntimeState["detailOverlay"], selectedItemId: string | null = this.state.selectedItemId): void {
    this.update({ detailOverlay, selectedItemId });
  }

  setInputMode(inputMode: InputMode): void {
    this.update({ inputMode, navigationOpen: inputMode === "compose" ? false : this.state.navigationOpen, focusedPane: inputMode === "compose" ? "stream" : "nav" });
  }

  setDashboardSection(section: DashboardSection): void {
    this.update({ dashboardSection: section });
  }

  /** Signal a full application exit (used by Ctrl+C and /exit in the workbench). */
  requestExit(): void {
    this.update({ exitRequested: true });
  }

  /** Record a tool call for rendering inside Ink components (tool activity dock). */
  addToolActivity(activity: ToolActivity): void {
    const toolActivity = [...this.state.toolActivity, activity].slice(-MAX_TOOL_ACTIVITY);
    this.update({ toolActivity });
  }

  updateToolActivity(id: string, patch: Partial<Omit<ToolActivity, "id">>): void {
    const toolActivity = this.state.toolActivity.map((activity) =>
      activity.id === id ? { ...activity, ...patch } : activity,
    );
    this.update({ toolActivity });
  }
}
