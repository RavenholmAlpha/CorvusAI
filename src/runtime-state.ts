import { EventEmitter } from "node:events";

export type UIMode = "line" | "stream" | "dashboard" | "setup";
export type DashboardSection = "setup" | "settings" | "permissions" | "tools" | "plugins" | "diagnostics";

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

export interface RuntimeState {
  mode: UIMode;
  dashboardSection: DashboardSection;
  commandDeckOpen: boolean;
  focusedPane: "stream" | "inspector" | "nav" | "panel";
  selectedItemId: string | null;
  setupStatus: SetupStatus | null;
  warnings: string[];
  approvalQueue: any[];
  evidenceItems: any[];
  recentDecisions: any[];
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
  dashboardSection: "setup",
  commandDeckOpen: false,
  focusedPane: "stream",
  selectedItemId: null,
  setupStatus: null,
  warnings: [],
  approvalQueue: [],
  evidenceItems: [],
  recentDecisions: [],
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

  setDashboardSection(section: DashboardSection): void {
    this.update({ dashboardSection: section });
  }
}
