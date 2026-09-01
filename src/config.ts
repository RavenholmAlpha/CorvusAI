import { access, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createDefaultPolicy, type PermissionPolicy } from "./permissions.js";
import { migrateConfig, validateConfig } from "./config-schema.js";
import type { AutomationConfig } from "./automation.js";
import type { RoutingRule } from "./orchestrator.js";
import type { BundleId, PermissionPreset } from "./bundles.js";

let pendingConfigSave: Promise<void> = Promise.resolve();

export type ProviderProtocol = "openai-chat" | "openai-responses" | "anthropic-messages";

export interface ProviderProfile {
  id: string;
  label?: string;
  protocol: ProviderProtocol;
  endpoint: string;
  apiKey: string;
  /** Secret reference, currently env:VARIABLE. Used before plaintext apiKey. */
  apiKeyRef?: string;
  models: string[];
  defaultModel?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fallbackProviderIds?: string[];
  capabilities?: { tools?: boolean; streaming?: boolean; vision?: boolean };
  /** Per-model runtime limits. Missing entries fall back to the global context window and provider temperature. */
  modelSettings?: Record<string, { contextWindowTokens?: number; maxOutputTokens?: number; temperature?: number }>;
}

export interface AgentRole {
  id: string;
  label?: string;
  providerId: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  allowedScopes?: string[];
  allowedTools?: string[];
  deniedTools?: string[];
  maxConcurrent?: number;
  maxChildDepth?: number;
  timeoutSeconds?: number;
  maxToolRounds?: number;
  maxContextTokens?: number;
  maxRequests?: number;
  maxPromptTokens?: number;
  maxCompletionTokens?: number;
  requireStructuredHandoff?: boolean;
  skills?: string[];
}

export interface ModelProfile {
  /** Stable ID used by task(profile) and parallel_tasks(profile). */
  id: string;
  label?: string;
  endpoint: string;
  model: string;
  apiKey: string;
  temperature?: number;
  providerId?: string;
  protocol?: ProviderProtocol;
}

export interface ChannelConfig {
  id: string;
  type: "webhook" | "telegram" | "slack" | "discord";
  enabled: boolean;
  projectId?: string;
  roleId?: string;
  tokenRef?: string;
  useOrchestrator?: boolean;
  outboundUrl?: string;
  credentialRef?: string;
  targetId?: string;
  allowedUsers?: string[];
  allowedTenants?: string[];
}

export interface ReviewConfig {
  enabled: boolean;
  instruction: string;
}

export interface CorvusConfig {
  schemaVersion: number;
  name: "Corvus";
  endpoint: string;
  model: string;
  apiKey: string;
  apiKeyEnv: string;
  goal: string;
  pluginDir: string;
  maxToolRounds: number;
  maxConsecutiveIdenticalToolCalls?: number;
  loopProtection?: boolean;
  contextWindowTokens: number;
  temperature: number;
  permissions: PermissionPolicy;
  review: ReviewConfig;
  systemPrompt: string;
  compactionThreshold: number;
  /** Behavior when switching a conversation to a model with a smaller context window. */
  contextOverflowMode?: "compact-with-previous-model" | "sliding-window";
  webLocale?: "en" | "zh-CN";
  /** Workbench theme preset name (see src/ui/theme.ts). Toggle at runtime with Ctrl+T. */
  theme: string;
  mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string>; timeoutMs?: number; url?: string; headers?: Record<string,string>; bearerTokenRef?: string; oauth?: { authorizationEndpoint: string; tokenEndpoint: string; clientId: string; scopes?: string[]; secretName?: string } }>;
  proxy?: string;
  sandbox?: { workspaceRoot?: string; allowedShellCommands?: string[] };
  /** Optional specialist models for delegated tasks; global model remains the main agent. */
  modelProfiles?: Record<string, ModelProfile>;
  /** Provider registry. A mainProviderId may override legacy endpoint/model/apiKey fields. */
  providers?: Record<string, ProviderProfile>;
  mainProviderId?: string;
  /** Reusable manually configured agent roles. Multiple roles may share one provider. */
  agentRoles?: Record<string, AgentRole>;
  automations?: Record<string, AutomationConfig>;
  routingRules?: Record<string, RoutingRule>;
  channels?: Record<string, ChannelConfig>;
  browser?: { cdpEndpoint?: string };
  executionNodes?: Record<string, { id: string; label?: string; type: "local" | "ssh" | "docker"; host?: string; user?: string; container?: string; cwd?: string; enabled: boolean; allowedCommands?: string[] }>;
  installation?: { bundle: BundleId; permissionPreset?: PermissionPreset; features: string[]; updatedAt?: string };
  plugins?: {
    installed?: Record<string, { version: string; source: string }>;
    enabled?: Record<string, boolean>;
    grants?: Record<string, string[]>;
    configs?: Record<string, unknown>;
  };
}

export function createDefaultConfig(): CorvusConfig {
  return {
    schemaVersion: 2,
    name: "Corvus",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "",
    apiKeyEnv: "OPENAI_API_KEY",
    goal: "",
    pluginDir: "plugins",
    // 0 = unlimited tool rounds. Set 1-500 to cap.
    maxToolRounds: 0,
    maxConsecutiveIdenticalToolCalls: 0,
    loopProtection: false,
    contextWindowTokens: 1_000_000,
    temperature: 0.2,
    permissions: createDefaultPolicy(),
    review: {
      enabled: false,
      instruction:
        "Before final answers, review tool results and permissions, then call out risks, uncertainty, and next actions.",
    },
    systemPrompt: "You are Corvus, a permissioned AI agent harness running in a terminal. You help the user with\ncoding, file operations, analysis, and general tasks by combining your knowledge with the tools\navailable in this environment.\n\n## Tools\n\n- Use tools whenever they can give you accurate, current information: read files before quoting\n  or editing them, list directories before assuming structure, and run shell commands for\n  environment-specific facts.\n- read_file, list_dir, grep_search and other low-risk tools are available freely. Risky tools\n  (write_file, shell, web_fetch, ...) may require approval: respect the decision and wait for\n  the result instead of bypassing or repeating the request.\n- If a tool is denied or unknown, do not insist. Adjust your approach, use a known tool, and tell\n  the user what you need.\n\n## Tool failure recovery\n\n- When a tool returns an error, read the message and fix the arguments (syntax, paths, format),\n  then retry once or twice. If it still fails, report the error and propose alternatives instead\n  of looping.\n- Verify paths with list_dir or read_file when unsure. Prefer absolute paths or paths relative to\n  the current working directory.\n\n## Output style\n\n- Respond in the same language as the user.\n- Be concise and actionable: short paragraphs, lists, or tables when helpful. Use Markdown\n  sparingly (code fences for code).\n- State what you did, what changed, and what the user should check next. Call out risks and\n  uncertainty explicitly.\n- Never fabricate file contents, command output, or tool results. Base claims on what you\n  actually observed.\n\n## Safety\n\n- Do not run destructive operations (deleting or overwriting data, installing software,\n  irreversible network mutations) without explicit user confirmation, even when the policy\n  allows it.\n- Keep secrets (API keys, tokens, credentials) out of replies and files unless the user asks.\n\n## Long conversations\n\n- Each exchange is persisted as a durable run; tool calls, results, approvals and evidence are\n  recorded and can be inspected with /runs, /run and /evidence.\n- If older context was compacted, rely on the summary and continue naturally; do not ask the\n  user to repeat themselves.",
    // Compaction fires at 70% of the context window (safety margin for the model API).
    compactionThreshold: Math.round(1_000_000 * 0.7),
    contextOverflowMode: "compact-with-previous-model",
    webLocale: "en",
    theme: "cassette",
    installation: { bundle: "default", permissionPreset: "balanced", features: ["durable-harness", "filesystem", "shell", "git", "web", "memory", "skills", "delegation", "workspaces", "mcp-client", "mcp-importer", "webhook", "webui"] },
    plugins: { installed: {}, enabled: {}, grants: {}, configs: {} },
  };
}

/** User-global Corvus data root. Kept outside the installed package so every
 * client and every Corvus installation sees the same configuration. */
export function getConfigRoot(): string {
  return process.env.CORVUS_HOME ? process.env.CORVUS_HOME : join(homedir(), ".corvus");
}

export function getDefaultConfigPath(): string {
  return join(getConfigRoot(), "config.json");
}

export function getGlobalSkillsRoot(): string {
  return join(getConfigRoot(), "skills");
}

export function getGlobalPluginsRoot(): string {
  return join(getConfigRoot(), "plugins");
}

export function getProjectConfigRoot(workspace: string): string {
  return join(workspace, ".corvus");
}

export function getProjectConfigPath(workspace: string): string {
  return join(getProjectConfigRoot(workspace), "config.json");
}

/** Location used by Corvus <=0.1.0. Exported only for transparent migration. */
export function getLegacyPackageConfigRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", ".corvus");
}

/** Non-destructively seed ~/.corvus from the old package-local directory. */
export async function ensureConfigLayout(root = getConfigRoot()): Promise<void> {
  await Promise.all(["skills", "plugins", "logs", "backups", "rules", "plugin-data"].map((name) => mkdir(join(root, name), { recursive: true })));
}

export async function migrateLegacyConfigRoot(legacyRoot = getLegacyPackageConfigRoot(), targetRoot = getConfigRoot()): Promise<boolean> {
  if (legacyRoot === targetRoot) return false;
  try { await access(legacyRoot); } catch { return false; }
  await mkdir(targetRoot, { recursive: true });
  // Runtime logging may create ~/.corvus/logs before startup reaches this
  // migration. Merge missing files instead of treating an existing root as
  // proof that migration already completed; never overwrite user data.
  const entries = await readdir(legacyRoot, { withFileTypes: true });
  let copied = false;
  for (const entry of entries) {
    const source = join(legacyRoot, entry.name); const target = join(targetRoot, entry.name);
    try { await access(target); } catch { await cp(source, target, { recursive: true, force: false, errorOnExist: false }); copied = true; }
  }
  return copied;
}

export async function loadConfig(path = getDefaultConfigPath()): Promise<CorvusConfig> {
  const defaults = createDefaultConfig();

  try {
    const raw = await readFile(path, "utf8");
    const parsed = migrateConfig(JSON.parse(raw) as Record<string, unknown>) as Partial<CorvusConfig>;
    const config: CorvusConfig = {
      ...defaults,
      ...parsed,
      permissions: {
        ...defaults.permissions,
        ...(parsed.permissions ?? {}),
        rules: {
          ...defaults.permissions.rules,
          ...(parsed.permissions?.rules ?? {}),
        },
      },
      review: {
        ...defaults.review,
        ...(parsed.review ?? {}),
      },
      providers: parsed.providers ? Object.fromEntries(Object.entries(parsed.providers).map(([id, provider]) => [id, { ...provider, id: provider.id ?? id, apiKey: provider.apiKey || parsed.apiKey || defaults.apiKey }])) : undefined,
    };
    const errors = validateConfig(config).filter((diagnostic) => diagnostic.level === "error");
    if (errors.length > 0) throw new Error("Invalid Corvus config: " + errors.map((error) => error.path + ": " + error.message).join("; "));
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaults;
    }
    throw error;
  }
}

export async function loadLayeredConfig(workspace: string): Promise<CorvusConfig> {
  const globalConfig = await loadConfig();
  const projectPath = getProjectConfigPath(workspace);
  try {
    const project = migrateConfig(JSON.parse(await readFile(projectPath, "utf8")) as Record<string, unknown>) as Partial<CorvusConfig>;
    return {
      ...globalConfig, ...project,
      permissions: { ...globalConfig.permissions, ...(project.permissions ?? {}), rules: { ...globalConfig.permissions.rules, ...(project.permissions?.rules ?? {}) } },
      review: { ...globalConfig.review, ...(project.review ?? {}) },
      mcpServers: { ...(globalConfig.mcpServers ?? {}), ...(project.mcpServers ?? {}) },
      providers: { ...(globalConfig.providers ?? {}), ...(project.providers ?? {}) },
      agentRoles: { ...(globalConfig.agentRoles ?? {}), ...(project.agentRoles ?? {}) },
      plugins: {
        installed: { ...(globalConfig.plugins?.installed ?? {}), ...(project.plugins?.installed ?? {}) },
        enabled: { ...(globalConfig.plugins?.enabled ?? {}), ...(project.plugins?.enabled ?? {}) },
        grants: { ...(globalConfig.plugins?.grants ?? {}), ...(project.plugins?.grants ?? {}) },
        configs: { ...(globalConfig.plugins?.configs ?? {}), ...(project.plugins?.configs ?? {}) },
      },
    };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return globalConfig; throw error; }
}

export function saveConfig(config: CorvusConfig, path = getDefaultConfigPath()): Promise<void> {
  // Snapshot at call time and serialize writes. Rapid TUI edits cannot finish out of order.
  const content = `${JSON.stringify(config, null, 2)}\n`;
  pendingConfigSave = pendingConfigSave.then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  });
  return pendingConfigSave;
}

