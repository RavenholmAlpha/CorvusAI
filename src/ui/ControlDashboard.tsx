import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { RuntimeState, RuntimeStateManager, DashboardSection } from "../runtime-state.js";
import type { ToolRegistry } from "../tools/index.js";
import { ui } from "./theme.js";

const SECTIONS: { label: string; value: DashboardSection }[] = [
  { label: "Setup Center", value: "setup" },
  { label: "Settings", value: "settings" },
  { label: "Permissions", value: "permissions" },
  { label: "Tools", value: "tools" },
  { label: "Plugins", value: "plugins" },
  { label: "Diagnostics", value: "diagnostics" },
];

interface DashboardProps {
  state: RuntimeState;
  manager: RuntimeStateManager;
  config?: any;
  tools?: ToolRegistry;
  plugins?: Array<{ name: string; version: string; status: string }>;
}

function SetupPanel({ state }: { state: RuntimeState }) {
  return (
    <Box flexDirection="column">
      <Text bold color={ui.brand}>Setup Center</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Status: {state.setupStatus?.hasConfig ? "Configured" : "Needs Config"}</Text>
        <Text color={ui.muted}>Use /setting wizard or the Setup mode (Esc to line, then /setup).</Text>
      </Box>
    </Box>
  );
}

function SettingsPanel({ config }: { config: any }) {
  return (
    <Box flexDirection="column">
      <Text bold color={ui.brand}>Settings (Read-only view)</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Model: {config?.model}</Text>
        <Text>Endpoint: {config?.endpoint}</Text>
        <Text>API Key: {config?.apiKey ? "configured (" + String(config.apiKey).slice(0, 8) + "...)" : "not set"}</Text>
        <Text>Max Tool Rounds: {config?.maxToolRounds === 0 ? "unlimited" : config?.maxToolRounds}</Text>
        <Text>Context Window: {config?.contextWindowTokens ? ((config.contextWindowTokens / 1000).toFixed(0)) + "K tokens" : "default"}</Text>
        <Text>Temperature: {config?.temperature}</Text>
        <Box marginTop={1}>
          <Text color={ui.muted}>{"To edit, use /setting <key> <value> or modify .corvus/config.json."}</Text>
        </Box>
      </Box>
    </Box>
  );
}

function PermissionsPanel({ config }: { config: any }) {
  const rules = Object.entries(config?.permissions?.rules ?? {}) as Array<[string, string]>;
  return (
    <Box flexDirection="column">
      <Text bold color={ui.brand}>Permissions & Security</Text>
      <Box marginTop={1} flexDirection="column">
        {rules.length === 0 ? (
          <Text color={ui.muted}>No rules — everything asks by default.</Text>
        ) : (
          rules.map(([target, decision]) => (
            <Text key={target} color={decision === "allow" ? ui.success : decision === "deny" ? ui.danger : ui.accent}>
              {target} = {decision}
            </Text>
          ))
        )}
        <Box marginTop={1}>
          <Text color={ui.muted}>Edit via /permission tool:name allow|ask|deny.</Text>
        </Box>
      </Box>
    </Box>
  );
}

function ToolsPanel({ tools }: { tools?: ToolRegistry }) {
  const list = tools?.list() ?? [];
  return (
    <Box flexDirection="column">
      <Text bold color={ui.brand}>Tool Registry ({list.length})</Text>
      <Box marginTop={1} flexDirection="column">
        {list.length === 0 ? (
          <Text color={ui.muted}>No tools registered.</Text>
        ) : (
          list.map((tool) => (
            <Text key={tool.name}>
              {tool.name}
              <Text color={ui.muted}> · {tool.capability} · {tool.risk ?? "low"}</Text>
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

function PluginsPanel({ plugins }: { plugins?: Array<{ name: string; version: string; status: string }> }) {
  const list = plugins ?? [];
  return (
    <Box flexDirection="column">
      <Text bold color={ui.brand}>Plugins ({list.filter((p) => p.status === "loaded").length} loaded)</Text>
      <Box marginTop={1} flexDirection="column">
        {list.length === 0 ? (
          <Text color={ui.muted}>No plugins loaded (plugin-dir: plugins/).</Text>
        ) : (
          list.map((plugin) => (
            <Text key={plugin.name} color={plugin.status === "loaded" ? ui.success : ui.danger}>
              {plugin.name}@{plugin.version} {plugin.status}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

function DiagnosticsPanel({ state }: { state: RuntimeState }) {
  const usage = state.contextUsage;
  return (
    <Box flexDirection="column">
      <Text bold color={ui.brand}>Diagnostics</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Mode: {state.mode}</Text>
        <Text>Compacting: {usage?.isCompacting ? "yes" : "no"}</Text>
        <Text>State: {usage?.state ?? "n/a"}</Text>
        <Text>Messages in memory: {usage?.messageCount ?? 0}</Text>
        <Text>Total requests: {usage?.totalRequests ?? 0}</Text>
        <Text>Prompt tokens: {(usage?.totalPromptTokens ?? 0) / 1000}K</Text>
        <Text>Completion tokens: {(usage?.totalCompletionTokens ?? 0) / 1000}K</Text>
        <Box marginTop={1}>
          <Text color={ui.muted}>Full logs in .corvus/logs/.</Text>
        </Box>
      </Box>
    </Box>
  );
}

export function ControlDashboard({ state, manager, config, tools, plugins }: DashboardProps) {
  const handleSelect = (item: { value: DashboardSection }) => {
    manager.setDashboardSection(item.value);
  };

  const activeIndex = SECTIONS.findIndex((s) => s.value === state.dashboardSection);

  return (
    <Box width="100%" height="100%" flexDirection="row">
      <Box width="25%" borderStyle="single" borderColor={ui.panelBorder} flexDirection="column" padding={1}>
        <Text bold underline>Dashboard</Text>
        <Box marginTop={1}>
          <SelectInput
            items={SECTIONS}
            onSelect={handleSelect}
            initialIndex={Math.max(0, activeIndex)}
          />
        </Box>
      </Box>

      <Box width="50%" borderStyle="single" borderColor={ui.panelBorder} padding={1}>
        {state.dashboardSection === "setup" && <SetupPanel state={state} />}
        {state.dashboardSection === "settings" && <SettingsPanel config={config} />}
        {state.dashboardSection === "permissions" && <PermissionsPanel config={config} />}
        {state.dashboardSection === "tools" && <ToolsPanel tools={tools} />}
        {state.dashboardSection === "plugins" && <PluginsPanel plugins={plugins} />}
        {state.dashboardSection === "diagnostics" && <DiagnosticsPanel state={state} />}
      </Box>

      <Box width="25%" borderStyle="single" borderColor={ui.panelBorder} padding={1} flexDirection="column">
        <Text bold underline>Runtime Summary</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={ui.success}>Model: {config?.model ?? "n/a"}</Text>
          <Text color={ui.success}>Endpoint: {config?.endpoint ?? "n/a"}</Text>
          <Text color={ui.muted}>Goal: {config?.goal || "not set"}</Text>
        </Box>
      </Box>
    </Box>
  );
}
