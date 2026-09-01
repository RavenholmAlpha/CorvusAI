import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { McpServerConfig } from "./client.js";

export type McpConfigSource = "claude-desktop" | "cursor-global" | "cursor-workspace" | "codex";
export interface DiscoveredMcpConfig { source: McpConfigSource; path: string; servers: Record<string, McpServerConfig>; error?: string; }

export function standardMcpConfigPaths(workspace = process.cwd(), home = homedir(), appData = process.env.APPDATA): Array<{ source: McpConfigSource; path: string }> {
  return [
    { source: "claude-desktop", path: appData ? join(appData, "Claude", "claude_desktop_config.json") : join(home, ".config", "Claude", "claude_desktop_config.json") },
    { source: "cursor-global", path: join(home, ".cursor", "mcp.json") },
    { source: "cursor-workspace", path: join(workspace, ".cursor", "mcp.json") },
    { source: "codex", path: join(home, ".codex", "config.toml") },
  ];
}

function validServer(value: unknown): value is McpServerConfig {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (typeof item.command === "string" || typeof item.url === "string") && (!item.args || Array.isArray(item.args)) && (!item.env || typeof item.env === "object");
}

export function parseJsonMcpConfig(text: string): Record<string, McpServerConfig> {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const raw = (parsed.mcpServers ?? parsed.servers ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, McpServerConfig] => validServer(entry[1])));
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

function parseTomlArray(value: string): string[] {
  const body = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  return [...body.matchAll(/"((?:\\.|[^"\\])*)"|'([^']*)'/g)].map((m) => (m[1] ?? m[2]).replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
}

/** Parse the Codex MCP subset without introducing a full TOML dependency. */
export function parseCodexMcpConfig(text: string): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {};
  let current: string | undefined;
  let envMode = false;
  for (const original of text.split(/\r?\n/)) {
    const line = original.replace(/\s+#.*$/, "").trim();
    if (!line) continue;
    const section = line.match(/^\[mcp_servers\.([^.\]]+)(?:\.(env))?\]$/);
    if (section) { current = unquote(section[1]); envMode = section[2] === "env"; servers[current] ??= { command: "" }; continue; }
    if (line.startsWith("[")) { current = undefined; envMode = false; continue; }
    if (!current) continue;
    const assignment = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!assignment) continue;
    const [, key, raw] = assignment;
    if (envMode) { (servers[current].env ??= {})[key] = unquote(raw); }
    else if (key === "command") servers[current].command = unquote(raw);
    else if (key === "args") servers[current].args = parseTomlArray(raw);
    else if (key === "env" && raw.trim().startsWith("{")) {
      const env: Record<string, string> = {};
      for (const match of raw.matchAll(/([A-Za-z0-9_.-]+)\s*=\s*("(?:\\.|[^"\\])*"|'[^']*')/g)) env[match[1]] = unquote(match[2]);
      servers[current].env = env;
    }
  }
  return Object.fromEntries(Object.entries(servers).filter(([, server]) => Boolean(server.command)));
}

export async function discoverMcpConfigs(workspace = process.cwd(), paths = standardMcpConfigPaths(workspace)): Promise<DiscoveredMcpConfig[]> {
  const found: DiscoveredMcpConfig[] = [];
  for (const candidate of paths) {
    try {
      const text = await readFile(candidate.path, "utf8");
      const servers = candidate.source === "codex" ? parseCodexMcpConfig(text) : parseJsonMcpConfig(text);
      found.push({ ...candidate, servers });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") found.push({ ...candidate, servers: {}, error: (error as Error).message });
    }
  }
  return found;
}

export function mergeDiscoveredMcpServers(discovered: DiscoveredMcpConfig[], existing: Record<string, McpServerConfig> = {}): { servers: Record<string, McpServerConfig>; imported: string[]; skipped: string[] } {
  const servers = { ...existing };
  const imported: string[] = [];
  const skipped: string[] = [];
  for (const config of discovered) for (const [name, server] of Object.entries(config.servers)) {
    if (servers[name]) { skipped.push(name); continue; }
    servers[name] = server; imported.push(name);
  }
  return { servers, imported, skipped };
}
