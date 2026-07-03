import { createDefaultConfig, type CorvusConfig } from "./config.js";
import type {
  ApprovalRow,
  ApprovalStatus,
  DecisionScope,
  EvidenceRow,
  MessageRow,
  RunRow,
  SnapshotRow,
} from "./harness/types.js";
import { formatPermissionRules, setPermissionRule, type PermissionDecision } from "./permissions.js";
import type { ToolQueueResult } from "./harness/tool-queue.js";
import type { ToolRegistry } from "./tools/index.js";
import type { ToolManifest } from "./tools/protocol.js";

export interface ParsedSlashCommand {
  name: string;
  args: string[];
}

export interface CommandContext {
  config: CorvusConfig;
  tools?: ToolRegistry;
  plugins?: Array<{ name: string; version: string; status: string }>;
  harness?: DurableHarnessAdapter;
  write: (line: string) => void;
  saveConfig?: () => Promise<void>;
}

export interface DurableHarnessAdapter {
  listRuns: () => RunRow[];
  getRun: (id: string) => RunRow | undefined;
  listMessages: (runId: string) => MessageRow[];
  latestSnapshot: (runId: string) => SnapshotRow | undefined;
  cancelRun: (id: string) => RunRow | undefined;
  resumeRun?: (id: string) => Promise<RunRow | undefined> | RunRow | undefined;
  listPendingApprovals: (runId?: string) => ApprovalRow[];
  resolveApproval: (id: string, status: ApprovalStatus, scope: DecisionScope) => ApprovalRow;
  runApproved: (toolCallId: string, tool: ToolManifest) => Promise<ToolQueueResult>;
  getEvidence: (id: string) => EvidenceRow | undefined;
  listEvidence: (runId: string) => EvidenceRow[];
}

export interface CommandResult {
  ok: boolean;
  message: string;
  exit?: boolean;
  persist?: boolean;
}

export interface CommandDefinition {
  name: string;
  summary: string;
  usage: string;
  category?: "main" | "configuration" | "agent" | "harness" | "diagnostics" | "session";
  execute: (args: string[], context: CommandContext) => Promise<CommandResult> | CommandResult;
}

export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const tokens = tokenize(trimmed.slice(1));
  if (tokens.length === 0) {
    return null;
  }

  const [name, ...args] = tokens;
  return { name: name.toLowerCase(), args };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  constructor(commands: CommandDefinition[] = []) {
    for (const command of commands) {
      this.register(command);
    }
  }

  register(command: CommandDefinition): void {
    this.commands.set(command.name, command);
  }

  list(): CommandDefinition[] {
    return [...this.commands.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  async execute(input: string, context: CommandContext): Promise<CommandResult> {
    const parsed = parseSlashCommand(input);
    if (!parsed) {
      return { ok: false, message: "Not a slash command" };
    }

    const command = this.commands.get(parsed.name);
    if (!command) {
      const result = { ok: false, message: `Unknown command /${parsed.name}. Try /help.` };
      context.write(result.message);
      return result;
    }

    try {
      const result = await command.execute(parsed.args, context);
      if (result.message) {
        context.write(result.message);
      }
      if (result.ok && result.persist && context.saveConfig) {
        await context.saveConfig();
      }
      return result;
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }
}

export function createCoreCommands(): CommandDefinition[] {
  const commands: CommandDefinition[] = [
    {
      name: "help",
      summary: "Show commands",
      usage: "/help",
      category: "main",
      execute: (_args, context) => ({
        ok: true,
        message: formatCommandHelp(commands),
      }),
    },
    {
      name: "menu",
      summary: "Show the command deck",
      usage: "/menu",
      category: "main",
      execute: (_args, context) => ({
        ok: true,
        message: formatMainMenu(context),
      }),
    },
    {
      name: "status",
      summary: "Show runtime status",
      usage: "/status",
      category: "diagnostics",
      execute: (_args, context) => ({
        ok: true,
        message: formatStatusPanel(context),
      }),
    },
    {
      name: "runs",
      summary: "List durable runs",
      usage: "/runs",
      category: "harness",
      execute: (_args, context) => {
        const runs = context.harness?.listRuns() ?? [];
        if (runs.length === 0) {
          return { ok: true, message: "No durable runs available." };
        }
        return { ok: true, message: formatRuns(runs) };
      },
    },
    {
      name: "run",
      summary: "Show a durable run",
      usage: "/run <id>",
      category: "harness",
      execute: (args, context) => {
        const id = args[0];
        if (!id) {
          return { ok: false, message: "Usage: /run <id>" };
        }
        if (!context.harness) {
          return { ok: false, message: "Durable harness unavailable." };
        }
        const run = context.harness.getRun(id);
        if (!run) {
          return { ok: false, message: `Run not found: ${id}` };
        }
        return {
          ok: true,
          message: formatRunDetails(
            run,
            context.harness.listMessages(run.id),
            context.harness.latestSnapshot(run.id),
          ),
        };
      },
    },
    {
      name: "resume",
      summary: "Resume a durable run",
      usage: "/resume <id>",
      category: "harness",
      execute: async (args, context) => {
        const id = args[0];
        if (!id) {
          return { ok: false, message: "Usage: /resume <id>" };
        }
        if (!context.harness) {
          return { ok: false, message: "Durable harness unavailable." };
        }
        if (!context.harness.resumeRun) {
          return { ok: false, message: "Durable run resume is not implemented." };
        }
        const run = context.harness.getRun(id);
        if (!run) {
          return { ok: false, message: `Run not found: ${id}` };
        }
        const resumed = await context.harness.resumeRun(id);
        if (!resumed) {
          return { ok: false, message: `Run not found: ${id}` };
        }
        return { ok: true, message: `Run ${resumed.id} resumed with status ${resumed.status}.` };
      },
    },
    {
      name: "cancel",
      summary: "Cancel a durable run",
      usage: "/cancel <id>",
      category: "harness",
      execute: (args, context) => {
        const id = args[0];
        if (!id) {
          return { ok: false, message: "Usage: /cancel <id>" };
        }
        if (!context.harness) {
          return { ok: false, message: "Durable harness unavailable." };
        }
        const canceled = context.harness.cancelRun(id);
        if (!canceled) {
          return { ok: false, message: `Run not found: ${id}` };
        }
        return { ok: true, message: `Run ${canceled.id} canceled.` };
      },
    },
    {
      name: "approvals",
      summary: "List pending durable approvals",
      usage: "/approvals",
      category: "harness",
      execute: (_args, context) => {
        const approvals = context.harness?.listPendingApprovals() ?? [];
        if (approvals.length === 0) {
          return { ok: true, message: "No pending approvals." };
        }
        return { ok: true, message: formatApprovals(approvals) };
      },
    },
    {
      name: "approve",
      summary: "Approve pending durable approval(s)",
      usage: "/approve <id|all>",
      category: "harness",
      execute: async (args, context) => {
        const target = args[0];
        if (!target) {
          return { ok: false, message: "Usage: /approve <id|all>" };
        }
        if (!context.harness) {
          return { ok: false, message: "Durable harness unavailable." };
        }
        return resolveApprovals(target, "approved", context);
      },
    },
    {
      name: "deny",
      summary: "Deny pending durable approval(s)",
      usage: "/deny <id|all>",
      category: "harness",
      execute: async (args, context) => {
        const target = args[0];
        if (!target) {
          return { ok: false, message: "Usage: /deny <id|all>" };
        }
        if (!context.harness) {
          return { ok: false, message: "Durable harness unavailable." };
        }
        return resolveApprovals(target, "denied", context);
      },
    },
    {
      name: "evidence",
      summary: "Show durable evidence",
      usage: "/evidence [id|last]",
      category: "harness",
      execute: (args, context) => {
        if (!context.harness) {
          return { ok: true, message: "No evidence available." };
        }
        const target = args[0] ?? "last";
        const evidence = target === "last" ? findLastEvidence(context.harness) : context.harness.getEvidence(target);
        if (!evidence) {
          return {
            ok: false,
            message: target === "last" ? "No evidence available." : `Evidence not found: ${target}`,
          };
        }
        return { ok: true, message: formatEvidence(evidence) };
      },
    },
    {
      name: "goal",
      summary: "Show or set the active goal",
      usage: "/goal [text]",
      category: "agent",
      execute: (args, context) => {
        if (args.length === 0) {
          return { ok: true, message: context.config.goal || "No active goal set." };
        }
        context.config.goal = args.join(" ");
        return { ok: true, persist: true, message: `Goal set: ${context.config.goal}` };
      },
    },
    {
      name: "model",
      summary: "Set model, endpoint, API key env, or temperature",
      usage: "/model [name] [--endpoint url] [--api-key-env ENV] [--temperature n]",
      category: "configuration",
      execute: (args, context) => {
        const next = parseModelArgs(args);
        const changes: string[] = [];
        if (next.model) changes.push(applySetting(context.config, "model", [next.model]));
        if (next.endpoint) changes.push(applySetting(context.config, "endpoint", [next.endpoint]));
        if (next.apiKeyEnv) changes.push(applySetting(context.config, "api-key-env", [next.apiKeyEnv]));
        if (next.temperature !== undefined) changes.push(applySetting(context.config, "temperature", [String(next.temperature)]));

        const persist =
          next.model !== undefined ||
          next.endpoint !== undefined ||
          next.apiKeyEnv !== undefined ||
          next.temperature !== undefined;
        return {
          ok: true,
          persist,
          message: `Model=${context.config.model} endpoint=${context.config.endpoint} apiKeyEnv=${context.config.apiKeyEnv} temperature=${context.config.temperature}`,
        };
      },
    },
    {
      name: "setting",
      summary: "Show or edit runtime settings",
      usage: "/setting [show|key value]",
      category: "configuration",
      execute: (args, context) => {
        if (args.length === 0 || args[0]?.toLowerCase() === "show") {
          return { ok: true, message: formatSettingsPanel(context.config) };
        }

        const [rawKey, ...rawValue] = args[0]?.toLowerCase() === "set" ? args.slice(1) : args;
        if (!rawKey) {
          return { ok: false, message: "Usage: /setting [show|key value]" };
        }

        const change = applySetting(context.config, rawKey, rawValue);
        return { ok: true, persist: true, message: change };
      },
    },
    {
      name: "permission",
      summary: "Show or set permission rules",
      usage: "/permission [tool:name|capability:name] [allow|ask|deny]",
      category: "configuration",
      execute: (args, context) => {
        if (args.length === 0) {
          return { ok: true, message: formatPermissionRules(context.config.permissions).join("\n") };
        }

        const [target, decision] = args;
        setPermissionRule(context.config.permissions, target, decision as PermissionDecision);
        return { ok: true, persist: true, message: `${target}=${decision}` };
      },
    },
    {
      name: "review",
      summary: "Toggle final-answer review mode",
      usage: "/review [on|off|status]",
      category: "agent",
      execute: (args, context) => {
        const value = args[0]?.toLowerCase() ?? "status";
        let persist = false;
        if (value === "on") {
          context.config.review.enabled = true;
          persist = true;
        } else if (value === "off") {
          context.config.review.enabled = false;
          persist = true;
        } else if (value !== "status") {
          return { ok: false, message: "Usage: /review [on|off|status]" };
        }
        return { ok: true, persist, message: `Review mode: ${context.config.review.enabled ? "on" : "off"}` };
      },
    },
    {
      name: "tools",
      summary: "List AI-callable tools",
      usage: "/tools",
      category: "diagnostics",
      execute: (_args, context) => {
        const tools = context.tools?.list() ?? [];
        if (tools.length === 0) {
          return { ok: true, message: "No tools registered." };
        }
        return {
          ok: true,
          message: tools.map((tool) => `${tool.name.padEnd(18)} ${tool.capability.padEnd(18)} ${tool.description}`).join("\n"),
        };
      },
    },
    {
      name: "plugins",
      summary: "List loaded plugins",
      usage: "/plugins",
      category: "diagnostics",
      execute: (_args, context) => {
        const plugins = context.plugins ?? [];
        if (plugins.length === 0) {
          return { ok: true, message: "No plugins loaded." };
        }
        return {
          ok: true,
          message: plugins.map((plugin) => `${plugin.name}@${plugin.version} ${plugin.status}`).join("\n"),
        };
      },
    },
    {
      name: "config",
      summary: "Show runtime configuration",
      usage: "/config",
      category: "diagnostics",
      execute: (_args, context) => ({
        ok: true,
        message: JSON.stringify(
          {
            model: context.config.model,
            endpoint: context.config.endpoint,
            apiKeyEnv: context.config.apiKeyEnv,
            goal: context.config.goal,
            pluginDir: context.config.pluginDir,
            maxToolRounds: context.config.maxToolRounds,
            temperature: context.config.temperature,
            review: context.config.review.enabled,
          },
          null,
          2,
        ),
      }),
    },
    {
      name: "exit",
      summary: "Exit Corvus",
      usage: "/exit",
      category: "session",
      execute: () => ({ ok: true, exit: true, message: "Stopping Corvus." }),
    },
  ];
  return commands;
}

function formatCommandHelp(commands: CommandDefinition[]): string {
  const categories: Array<[NonNullable<CommandDefinition["category"]>, string]> = [
    ["main", "Main Deck"],
    ["configuration", "Configuration"],
    ["agent", "Agent"],
    ["harness", "Durable Harness"],
    ["diagnostics", "Diagnostics"],
    ["session", "Session"],
  ];
  const lines = ["Corvus commands:"];
  for (const [category, label] of categories) {
    const group = commands.filter((command) => (command.category ?? "main") === category);
    if (group.length === 0) continue;
    lines.push("", `${label}:`);
    for (const command of group) {
      lines.push(`  ${command.usage.padEnd(52)} ${command.summary}`);
    }
  }
  lines.push("", "Type normal text to send a message to the agent. Use /menu for a task-oriented deck.");
  return lines.join("\n");
}

function formatMainMenu(context: CommandContext): string {
  const toolCount = context.tools?.list().length ?? 0;
  const pluginCount = context.plugins?.filter((plugin) => plugin.status === "loaded").length ?? 0;
  const runCount = context.harness?.listRuns().length ?? 0;
  const approvalCount = context.harness?.listPendingApprovals().length ?? 0;
  return [
    "Corvus Control Deck",
    "-------------------",
    "Chat          Type any message",
    `Durable      /runs (${runCount}) | /approvals (${approvalCount}) | /evidence last`,
    "Settings      /setting show | /setting model <name> | /setting endpoint <url>",
    "Permissions   /permission | /permission tool:shell deny",
    `Tools         /tools (${toolCount} registered)`,
    `Plugins       /plugins (${pluginCount} loaded)`,
    "Review        /review on | /review off | /status",
    "Diagnostics   /config | /status",
    "Session       /exit",
  ].join("\n");
}

function formatStatusPanel(context: CommandContext): string {
  const tools = context.tools?.list() ?? [];
  const plugins = context.plugins ?? [];
  const loadedPlugins = plugins.filter((plugin) => plugin.status === "loaded").length;
  const apiKeyState = process.env[context.config.apiKeyEnv] ? "set" : "missing";
  const durableRuns = context.harness?.listRuns().length ?? 0;
  const durableApprovals = context.harness?.listPendingApprovals().length ?? 0;
  const permissions = Object.values(context.config.permissions.rules).reduce(
    (counts, decision) => {
      counts[decision] += 1;
      return counts;
    },
    { allow: 0, ask: 0, deny: 0 } as Record<PermissionDecision, number>,
  );
  return [
    "Runtime Status",
    "--------------",
    `Model: ${context.config.model}`,
    `Endpoint: ${context.config.endpoint}`,
    `API key env: ${context.config.apiKeyEnv} (${apiKeyState})`,
    `Temperature: ${context.config.temperature}`,
    `Max tool rounds: ${context.config.maxToolRounds}`,
    `Goal: ${context.config.goal || "not set"}`,
    `Review: ${context.config.review.enabled ? "on" : "off"}`,
    `Tools: ${tools.length} registered`,
    `Plugins: ${loadedPlugins} loaded`,
    `Durable harness: ${context.harness ? "available" : "unavailable"}`,
    `Durable runs: ${durableRuns}`,
    `Pending approvals: ${durableApprovals}`,
    `Permissions: ${permissions.allow} allow / ${permissions.ask} ask / ${permissions.deny} deny`,
  ].join("\n");
}

function formatRuns(runs: RunRow[]): string {
  return [
    "Durable runs:",
    ...runs.map((run) => `${run.id.padEnd(38)} ${run.status.padEnd(20)} ${run.goal}`),
  ].join("\n");
}

function formatRunDetails(run: RunRow, messages: MessageRow[], snapshot?: SnapshotRow): string {
  const lines = [
    `Run ${run.id}`,
    `Status: ${run.status}`,
    `Goal: ${run.goal}`,
    `Model: ${run.model}`,
    `Endpoint: ${run.endpoint}`,
    `Created: ${run.createdAt}`,
    `Updated: ${run.updatedAt}`,
    `Completed: ${run.completedAt ?? "not completed"}`,
    "",
    "Messages:",
  ];

  if (messages.length === 0) {
    lines.push("  No messages.");
  } else {
    for (const message of messages) {
      const label = message.toolCallId ? `${message.role}(${message.toolCallId})` : message.role;
      lines.push(`  ${label}: ${preview(message.content ?? "")}`);
    }
  }

  lines.push("", "Latest snapshot:");
  if (!snapshot) {
    lines.push("  No snapshot.");
  } else {
    lines.push(`  ${snapshot.id} ${snapshot.createdAt}`);
    lines.push(`  ${preview(JSON.stringify(snapshot.snapshot))}`);
  }

  return lines.join("\n");
}

function formatApprovals(approvals: ApprovalRow[]): string {
  return [
    "Pending approvals:",
    ...approvals.map(
      (approval) =>
        `${approval.id.padEnd(38)} run=${approval.runId} tool=${approval.toolName ?? "unknown"} call=${approval.toolCallId}`,
    ),
  ].join("\n");
}

async function resolveApprovals(
  target: string,
  status: "approved" | "denied",
  context: CommandContext,
): Promise<CommandResult> {
  const harness = context.harness;
  if (!harness) {
    return { ok: false, message: "Durable harness unavailable." };
  }

  const pending = harness.listPendingApprovals();
  const approvals = target.toLowerCase() === "all" ? pending : pending.filter((approval) => approval.id === target);
  if (approvals.length === 0) {
    return {
      ok: false,
      message: target.toLowerCase() === "all" ? "No pending approvals." : `Approval not found: ${target}`,
    };
  }

  const lines: string[] = [];
  let ok = true;
  for (const approval of approvals) {
    try {
      const resolved = harness.resolveApproval(approval.id, status, "once");
      if (status === "approved") {
        lines.push(`Approval ${resolved.id} approved.`);
        const tool = findTool(context.tools, resolved.toolName);
        if (!tool) {
          lines.push(
            `Tool call ${resolved.toolCallId} approved; tool manifest ${resolved.toolName ?? "unknown"} unavailable.`,
          );
          continue;
        }
        const executed = await harness.runApproved(resolved.toolCallId, tool);
        lines.push(`Tool call ${executed.toolCallId} executed: ${executed.status}${formatEvidenceSuffix(executed)}.`);
      } else {
        lines.push(`Approval ${resolved.id} denied.`);
      }
    } catch (error) {
      ok = false;
      lines.push(`Approval ${approval.id} failed: ${(error as Error).message}`);
    }
  }

  return { ok, message: lines.join("\n") };
}

function findTool(tools: ToolRegistry | undefined, name: string | null): ToolManifest | undefined {
  if (!name) {
    return undefined;
  }
  return tools?.list().find((tool) => tool.name === name);
}

function formatEvidenceSuffix(result: ToolQueueResult): string {
  return "evidenceId" in result && result.evidenceId ? ` evidence=${result.evidenceId}` : "";
}

function findLastEvidence(harness: DurableHarnessAdapter): EvidenceRow | undefined {
  const runs = harness.listRuns();
  for (const run of [...runs].reverse()) {
    const evidence = harness.listEvidence(run.id);
    if (evidence.length > 0) {
      return evidence[evidence.length - 1];
    }
  }
  return undefined;
}

function formatEvidence(evidence: EvidenceRow): string {
  return [
    `Evidence ${evidence.id}`,
    `Run: ${evidence.runId}`,
    `Source: ${evidence.sourceType} ${evidence.sourceId}`,
    `Title: ${evidence.title}`,
    `Summary: ${evidence.summary}`,
    "Content:",
    preview(evidence.content, 2000),
  ].join("\n");
}

function preview(value: string, maxLength = 500): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function formatSettingsPanel(config: CorvusConfig): string {
  return [
    "Corvus Settings",
    "---------------",
    `model             ${config.model}`,
    `endpoint          ${config.endpoint}`,
    `api-key-env       ${config.apiKeyEnv}`,
    `temperature       ${config.temperature}`,
    `max-tool-rounds   ${config.maxToolRounds}`,
    `plugin-dir        ${config.pluginDir}`,
    `review            ${config.review.enabled ? "on" : "off"}`,
    `goal              ${config.goal || "not set"}`,
    "",
    "Edit examples:",
    "  /setting model gpt-4.1-mini",
    "  /setting endpoint https://api.openai.com/v1",
    "  /setting api-key-env OPENAI_API_KEY",
    "  /setting temperature 0.2",
    "  /setting max-tool-rounds 6",
    "  /setting plugin-dir plugins",
    "  /setting review on",
    "  /setting goal Build a safer agent",
  ].join("\n");
}

function applySetting(config: CorvusConfig, rawKey: string, rawValue: string[]): string {
  const key = normalizeSettingKey(rawKey);
  const value = rawValue.join(" ").trim();

  if (key !== "reset" && value.length === 0) {
    throw new Error(`Setting ${rawKey} requires a value`);
  }

  switch (key) {
    case "model":
      config.model = value;
      return `model=${config.model}`;
    case "endpoint":
      validateHttpUrl(value, "endpoint");
      config.endpoint = value.replace(/\/+$/, "");
      return `endpoint=${config.endpoint}`;
    case "apiKeyEnv":
      validateEnvName(value);
      config.apiKeyEnv = value;
      return `apiKeyEnv=${config.apiKeyEnv}`;
    case "temperature":
      config.temperature = parseNumberSetting(value, "temperature", 0, 2);
      return `temperature=${config.temperature}`;
    case "maxToolRounds":
      config.maxToolRounds = parseIntegerSetting(value, "max-tool-rounds", 1, 50);
      return `maxToolRounds=${config.maxToolRounds}`;
    case "pluginDir":
      config.pluginDir = value;
      return `pluginDir=${config.pluginDir}`;
    case "review":
      config.review.enabled = parseOnOff(value, "review");
      return `review=${config.review.enabled ? "on" : "off"}`;
    case "reviewInstruction":
      config.review.instruction = value;
      return "reviewInstruction=updated";
    case "goal":
      config.goal = value;
      return `goal=${config.goal}`;
    case "systemPrompt":
      config.systemPrompt = value;
      return "systemPrompt=updated";
    case "reset": {
      const defaults = createDefaultConfig();
      Object.assign(config, defaults);
      return "settings=reset";
    }
    default:
      throw new Error(`Unknown setting ${rawKey}. Try /setting show.`);
  }
}

function normalizeSettingKey(key: string):
  | "model"
  | "endpoint"
  | "apiKeyEnv"
  | "temperature"
  | "maxToolRounds"
  | "pluginDir"
  | "review"
  | "reviewInstruction"
  | "goal"
  | "systemPrompt"
  | "reset" {
  switch (key.toLowerCase()) {
    case "model":
      return "model";
    case "endpoint":
    case "base-url":
    case "baseurl":
      return "endpoint";
    case "api-key-env":
    case "apikeyenv":
    case "api-key":
      return "apiKeyEnv";
    case "temperature":
    case "temp":
      return "temperature";
    case "max-tool-rounds":
    case "max-tool-round":
    case "tool-rounds":
      return "maxToolRounds";
    case "plugin-dir":
    case "plugindir":
    case "plugins":
      return "pluginDir";
    case "review":
      return "review";
    case "review-instruction":
      return "reviewInstruction";
    case "goal":
      return "goal";
    case "system-prompt":
    case "prompt":
      return "systemPrompt";
    case "reset":
      return "reset";
    default:
      throw new Error(`Unknown setting ${key}. Try /setting show.`);
  }
}

function validateHttpUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid http(s) URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https`);
  }
}

function validateEnvName(value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error("api-key-env must be a valid environment variable name");
  }
}

function parseNumberSetting(value: string, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be a number from ${min} to ${max}`);
  }
  return parsed;
}

function parseIntegerSetting(value: string, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function parseOnOff(value: string, label: string): boolean {
  const normalized = value.toLowerCase();
  if (["on", "true", "yes", "1"].includes(normalized)) return true;
  if (["off", "false", "no", "0"].includes(normalized)) return false;
  throw new Error(`${label} must be on or off`);
}

function parseModelArgs(args: string[]): {
  model?: string;
  endpoint?: string;
  apiKeyEnv?: string;
  temperature?: number;
} {
  const result: {
    model?: string;
    endpoint?: string;
    apiKeyEnv?: string;
    temperature?: number;
  } = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--endpoint" && next) {
      result.endpoint = next;
      index += 1;
    } else if (arg === "--api-key-env" && next) {
      result.apiKeyEnv = next;
      index += 1;
    } else if (arg === "--temperature" && next) {
      result.temperature = Number(next);
      index += 1;
    } else if (!arg.startsWith("--") && !result.model) {
      result.model = arg;
    }
  }

  return result;
}
