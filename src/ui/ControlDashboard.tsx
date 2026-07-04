import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { RuntimeState, RuntimeStateManager, DashboardSection } from "../runtime-state.js";

const SECTIONS: { label: string; value: DashboardSection }[] = [
  { label: "Setup Center", value: "setup" },
  { label: "Settings", value: "settings" },
  { label: "Permissions", value: "permissions" },
  { label: "Tools", value: "tools" },
  { label: "Plugins", value: "plugins" },
  { label: "Diagnostics", value: "diagnostics" },
];

function SetupPanel({ state }: { state: RuntimeState }) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Setup Center</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Status: {state.setupStatus?.hasConfig ? "Configured" : "Needs Config"}</Text>
        <Text color="gray">Press Enter to run health checks.</Text>
      </Box>
    </Box>
  );
}

function SettingsPanel() {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Settings</Text>
      <Text dimColor>Configuration properties goes here...</Text>
    </Box>
  );
}

function PermissionsPanel() {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Permissions & Security</Text>
      <Text dimColor>Permission presets and rule editor...</Text>
    </Box>
  );
}

function ToolsPanel() {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Tool Registry</Text>
      <Text dimColor>Registered tools...</Text>
    </Box>
  );
}

function PluginsPanel() {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Plugins</Text>
      <Text dimColor>Loaded plugins...</Text>
    </Box>
  );
}

function DiagnosticsPanel() {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Diagnostics</Text>
      <Text dimColor>System health...</Text>
    </Box>
  );
}

export function ControlDashboard({ state, manager }: { state: RuntimeState; manager: RuntimeStateManager }) {
  const handleSelect = (item: { value: DashboardSection }) => {
    manager.setDashboardSection(item.value);
  };

  const activeIndex = SECTIONS.findIndex((s) => s.value === state.dashboardSection);

  return (
    <Box width="100%" height="100%" flexDirection="row">
      <Box width="25%" borderStyle="single" borderColor="gray" flexDirection="column" padding={1}>
        <Text bold underline>Dashboard</Text>
        <Box marginTop={1}>
          <SelectInput
            items={SECTIONS}
            onSelect={handleSelect}
            onHighlight={handleSelect}
            initialIndex={Math.max(0, activeIndex)}
          />
        </Box>
      </Box>

      <Box width="50%" borderStyle="single" borderColor="gray" padding={1}>
        {state.dashboardSection === "setup" && <SetupPanel state={state} />}
        {state.dashboardSection === "settings" && <SettingsPanel />}
        {state.dashboardSection === "permissions" && <PermissionsPanel />}
        {state.dashboardSection === "tools" && <ToolsPanel />}
        {state.dashboardSection === "plugins" && <PluginsPanel />}
        {state.dashboardSection === "diagnostics" && <DiagnosticsPanel />}
      </Box>

      <Box width="25%" borderStyle="single" borderColor="gray" padding={1} flexDirection="column">
        <Text bold underline>Runtime Summary</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="green">Model: Active</Text>
          <Text color="green">Endpoint: OK</Text>
          <Text color="yellow">Warnings: {state.warnings.length}</Text>
        </Box>
      </Box>
    </Box>
  );
}
