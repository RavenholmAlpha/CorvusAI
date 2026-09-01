import React from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import type { CorvusAgent } from "../agent.js";
import type { DurableHarnessAdapter } from "../commands.js";
import type { CorvusConfig } from "../config.js";
import type { RuntimeState } from "../runtime-state.js";
import { getActiveThemeName, THEME_NAMES, ui } from "./theme.js";
import { validateConfig } from "../config-schema.js";

export function ProjectsPage({ projects, activeProjectId, onAction, onBack }: { projects: Array<{ id: string; name: string; path: string; lastSessionId: string | null }>; activeProjectId: string; onAction: (action: string) => void; onBack: () => void }) {
  useInput((_input, key) => { if (key.escape || key.leftArrow) onBack(); });
  const items = [
    ...projects.map((project) => ({ label: (project.id === activeProjectId ? "● " : "  ") + project.name + " · " + project.path, value: "select:" + project.id })),
    { label: "＋ Register project", value: "add" },
    { label: "← Back to Workspace", value: "back" },
  ];
  return <Box flexGrow={1} flexDirection="column" padding={1}>
    <Text bold color={ui.brand}>Projects</Text>
    <Text color={ui.muted}>Each project has separate sessions, tasks, scope leases and project memory.</Text>
    <Box marginTop={1}><SelectInput items={items} onSelect={(item) => onAction(String(item.value))} /></Box>
  </Box>;
}
export function ApprovalPage({ harness }: { harness?: DurableHarnessAdapter }) {
  const approvals = harness?.listPendingApprovals() ?? [];
  return <Box flexGrow={1} flexDirection="column" padding={1} overflow="hidden">
    <Text bold color={ui.accent}>Approvals · {approvals.length} pending</Text>
    <Text color={ui.muted}>Press a to open Approval Center and resolve selected items.</Text>
    <Box marginTop={1} flexDirection="column">
      {approvals.length === 0 ? <Text color={ui.success}>No pending approvals.</Text> : approvals.slice(0, 12).map((approval) => <Box key={approval.id} borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
        <Text color={ui.accent}>{approval.toolName ?? "unknown tool"} · run {approval.runId.slice(0, 22)}</Text>
        <Text color={ui.muted}>approval {approval.id.slice(0, 20)} · tool call {approval.toolCallId.slice(0, 20)}</Text>
      </Box>)}
    </Box>
  </Box>;
}

export function TasksPage({ agent, harness, state }: { agent: CorvusAgent; harness?: DurableHarnessAdapter; state: RuntimeState }) {
  const tasks = harness?.listSubagentTasks?.(agent.activeSessionId()) ?? [];
  return <Box flexGrow={1} flexDirection="column" padding={1} overflow="hidden">
    <Text bold color={ui.accent}>Sub-agent Tasks · {tasks.length}</Text>
    <Text color={ui.muted}>→ focus list · ↑↓ select · Enter detail · c cancel</Text>
    <Box marginTop={1} flexDirection="column">
      {tasks.length === 0 ? <Text color={ui.muted}>No delegated tasks in this session.</Text> : tasks.slice(0, 16).map((task, index) => {
        const color = task.status === "succeeded" ? ui.success : task.status === "failed" ? ui.danger : task.status === "running" ? ui.accent : ui.muted;
        return <Box key={task.id} borderStyle="single" borderColor={state.focusedPane === "panel" && state.contentIndex === index ? ui.accent : "gray"} paddingX={1} flexDirection="column">
          <Text color={color}>{state.focusedPane === "panel" && state.contentIndex === index ? "▸ " : "  "}[{task.status}] d{task.depth} {task.description || task.prompt.slice(0, 54)}</Text>
          <Text color={ui.muted}>{task.id.slice(0, 24)} · {task.modelProfile ?? "default"} · child {task.childSessionId.slice(0, 20)}</Text>
        </Box>;
      })}
    </Box>
  </Box>;
}

export function RunsPage({ harness, state }: { harness?: DurableHarnessAdapter; state: RuntimeState }) {
  const runs = [...(harness?.listRuns() ?? [])].reverse();
  return <Box flexGrow={1} flexDirection="column" padding={1} overflow="hidden">
    <Text bold color={ui.brand}>Durable Runs · {runs.length}</Text>
    <Text color={ui.muted}>→ focus list · ↑↓ select · Enter detail · r resume</Text>
    <Box marginTop={1} flexDirection="column">
      {runs.slice(0, 16).map((run, index) => <Box key={run.id} borderStyle="single" borderColor={state.focusedPane === "panel" && state.contentIndex === index ? ui.accent : "gray"} paddingX={1}>
        <Text color={run.status === "failed" ? ui.danger : run.status === "succeeded" ? ui.success : ui.accent}>{state.focusedPane === "panel" && state.contentIndex === index ? "▸ " : "  "}[{run.status}] {run.goal.slice(0, 58)} · {run.id.slice(0, 18)}</Text>
      </Box>)}
    </Box>
  </Box>;
}

export function ContextPage({ agent }: { agent: CorvusAgent }) {
  const usage = agent.contextUsage();
  const ratio = usage.contextWindow > 0 ? usage.lastRequestTokens / usage.contextWindow : 0;
  const filled = Math.max(0, Math.min(24, Math.round(ratio * 24)));
  return <Box flexGrow={1} flexDirection="column" padding={1}>
    <Text bold color={ui.brand}>Context & Memory</Text>
    <Text color={ui.accent}>{"█".repeat(filled)}{"░".repeat(24 - filled)} {Math.round(ratio * 100)}%</Text>
    <Text>Last request: {usage.lastRequestTokens} / {usage.contextWindow} tokens</Text>
    <Text>Memory messages: {usage.messageCount} · state: {usage.state}</Text>
    <Box marginTop={1} flexDirection="column">
      <Text color={ui.muted}>System {usage.memoryBreakdown.system} · User {usage.memoryBreakdown.user}</Text>
      <Text color={ui.muted}>Assistant {usage.memoryBreakdown.assistant} · Tool {usage.memoryBreakdown.tool}</Text>
      <Text color={ui.muted}>Requests {usage.totalRequests} · Prompt {usage.totalPromptTokens} · Completion {usage.totalCompletionTokens}</Text>
    </Box>
  </Box>;
}

export function SettingsPage({ config, onAction, onBack }: { config: CorvusConfig; onAction: (action: string) => void; onBack: () => void }) {
  const diagnostics = validateConfig(config);
  useInput((_input, key) => { if (key.escape || key.leftArrow) onBack(); });
  const mainProvider = config.mainProviderId ? config.providers?.[config.mainProviderId] : undefined;
  const items = [
    { label: "Main conversation · " + (mainProvider ? (mainProvider.label || mainProvider.id) + " / " + (mainProvider.defaultModel || mainProvider.models[0] || "no model") : "legacy " + config.model) + " →", value: "providers" },
    { label: "Theme · " + getActiveThemeName() + "  (cycle)", value: "theme" },
    { label: "Review · " + (config.review.enabled ? "ON" : "OFF") + "  (toggle)", value: "review" },
    { label: "Tool rounds · " + (config.maxToolRounds === 0 ? "unlimited" : config.maxToolRounds) + "  (toggle)", value: "rounds" },
    { label: "Context window · " + (config.contextWindowTokens / 1000).toFixed(0) + "K  (cycle)", value: "context" },
    { label: "Providers & protocols →", value: "providers" },
    { label: "Agent roles →", value: "roles" },
    { label: "Permission rules →", value: "permissions" },
  ];
  return <Box flexGrow={1} flexDirection="column" padding={1}>
    <Text bold color={ui.brand}>Settings</Text>
    <Text color={ui.muted}>Select a setting with ↑↓, then press Enter. Values save immediately.</Text>
    <Box marginTop={1}>
      <SelectInput items={items} onSelect={(item) => onAction(String(item.value))} />
    </Box>
    <Box marginTop={1} flexDirection="column">
      <Text color={ui.muted}>Main model: {config.model} · legacy endpoint: {config.endpoint}</Text>
      <Text color={ui.muted}>Themes: {THEME_NAMES.join(", ")}</Text>
      <Text color={diagnostics.some((item) => item.level === "error") ? ui.danger : diagnostics.length ? ui.accent : ui.success}>Config diagnostics: {diagnostics.length === 0 ? "healthy" : diagnostics.length + " issue(s)"}</Text>
      {diagnostics.slice(0, 4).map((item) => <Text key={item.path} color={item.level === "error" ? ui.danger : ui.accent}>[{item.level}] {item.path}: {item.message}</Text>)}
    </Box>
  </Box>;
}

export function RolesPage({ config, onAction, onBack }: { config: CorvusConfig; onAction: (action: string) => void; onBack: () => void }) {
  useInput((_input, key) => { if (key.escape || key.leftArrow) onBack(); });
  const roles = Object.values(config.agentRoles ?? {});
  const items = [
    ...roles.flatMap((role) => [
      { label: "Edit · " + (role.label || role.id) + " → " + role.providerId + (role.model ? " / " + role.model : ""), value: "edit:" + role.id },
      { label: "✕ Delete · " + (role.label || role.id), value: "delete:" + role.id },
    ]),
    { label: "＋ Add role", value: "add" },
    { label: "← Back to Settings", value: "back" },
  ];
  return <Box flexGrow={1} flexDirection="column" padding={1}>
    <Text bold color={ui.brand}>Agent Roles</Text>
    <Text color={ui.muted}>Roles are manual reusable assignments. Multiple roles can use one provider.</Text>
    <Box marginTop={1}><SelectInput items={items} onSelect={(item) => onAction(String(item.value))} /></Box>
  </Box>;
}
export function ToolsPage({ tools }: { tools?: import("../tools/index.js").ToolRegistry }) {
  const list = tools?.list() ?? [];
  return <Box flexGrow={1} flexDirection="column" padding={1} overflow="hidden">
    <Text bold color={ui.brand}>Tools</Text>
    <Text color={ui.muted}>Registered tools and their permission-relevant risk level.</Text>
    <Box marginTop={1} flexDirection="column">
      {list.length === 0 ? <Text color={ui.muted}>No tools registered.</Text> : list.map((tool) => <Box key={tool.name} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color={tool.risk === "high" ? ui.danger : tool.risk === "medium" ? ui.accent : ui.success}>{tool.name}</Text>
        <Text color={ui.muted}> · {tool.capability} · {tool.risk}</Text>
      </Box>)}
    </Box>
  </Box>;
}
export function ProvidersPage({ config, onAction, onBack }: { config: CorvusConfig; onAction: (action: string) => void; onBack: () => void }) {
  useInput((_input, key) => { if (key.escape || key.leftArrow) onBack(); });
  const providers = Object.values(config.providers ?? {});
  const items = [
    ...providers.flatMap((provider) => [
      { label: (provider.id === config.mainProviderId ? "● " : "  ") + "Edit · " + (provider.label || provider.id) + " · " + provider.protocol + " · " + (provider.defaultModel || provider.models[0] || "no model"), value: "edit:" + provider.id },
      { label: "  ★ Set main · " + (provider.label || provider.id), value: "main:" + provider.id },
      { label: "  ✕ Delete · " + (provider.label || provider.id), value: "delete:" + provider.id },
    ]),
    { label: "＋ Add provider", value: "add" },
    { label: "← Back to Settings", value: "back" },
  ];
  return <Box flexGrow={1} flexDirection="column" padding={1} overflow="hidden">
    <Text bold color={ui.brand}>Providers & Protocols</Text>
    <Text color={ui.muted}>OpenAI Chat · OpenAI Responses · Anthropic Messages</Text>
    <Text color={ui.muted}>Use the visible menu. Enter opens an editor; Esc / ← returns to Settings.</Text>
    <Box marginTop={1}><SelectInput items={items} onSelect={(item) => onAction(String(item.value))} /></Box>
    <Box marginTop={1} flexDirection="column">
      <Text color={ui.muted}>Main provider: {config.mainProviderId ?? "legacy global endpoint"}</Text>
      <Text color={ui.muted}>Each provider stores protocol, endpoint, model, API key and temperature.</Text>
    </Box>
  </Box>;
}