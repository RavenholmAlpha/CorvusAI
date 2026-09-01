import type { RegistryDisposer, ToolRegistry } from "../tools/index.js";
import { createToolManifest } from "../tools/protocol.js";
import { McpClient, type McpServerConfig } from "./client.js";
import { HttpMcpClient, isHttpMcpConfig } from "./http-client.js";

export interface LoadedMcpServer { name: string; toolCount: number; status: "loaded" | "failed"; error?: string; }
type McpConnection = McpClient | HttpMcpClient;

async function loadServer(name: string, config: McpServerConfig, tools: ToolRegistry, registerTools = true): Promise<{ result: LoadedMcpServer; dispose?: RegistryDisposer; client?: McpConnection }> {
  const client: McpConnection = isHttpMcpConfig(config) ? new HttpMcpClient(config) : new McpClient(config);
  const disposers: RegistryDisposer[] = [];
  try {
    await client.connect();
    const remoteTools = await client.listTools();
    if (registerTools) for (const remote of remoteTools) disposers.push(tools.register(createToolManifest({
      name: `mcp_${name}_${remote.name}`, namespace: `mcp:${name}`, version: "1.0.0",
      description: remote.description || `MCP tool ${remote.name} from server ${name}`, capability: "plugin", risk: "medium",
      parameters: (remote.inputSchema as never) ?? { type: "object" }, timeoutMs: 60000, outputLimitBytes: 20000,
      concurrency: { perTool: 1, perRun: 1, global: 1 }, evidencePolicy: "summary", resources: ["plugin"],
      execute: async (args) => ({ ok: true, output: await client.callTool(remote.name, args) }),
    })));
    let disposed = false;
    return { result: { name, toolCount: remoteTools.length, status: "loaded" }, client, dispose: () => { if (disposed) return false; disposed = true; let changed = false; for (const dispose of disposers.reverse()) changed = dispose() || changed; return changed; } };
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    await client.disconnect().catch(() => undefined);
    return { result: { name, toolCount: 0, status: "failed", error: (error as Error).message } };
  }
}

export async function loadMcpServers(servers: Record<string, McpServerConfig>, tools: ToolRegistry): Promise<LoadedMcpServer[]> {
  const results: LoadedMcpServer[] = [];
  for (const [name, config] of Object.entries(servers)) results.push((await loadServer(name, config, tools)).result);
  return results;
}

export class McpRuntimeManager {
  private active: Array<{ dispose: RegistryDisposer; client: McpConnection }> = [];
  private results: LoadedMcpServer[] = [];
  constructor(private readonly tools: ToolRegistry) {}
  list(): LoadedMcpServer[] { return this.results.map((item) => ({ ...item })); }
  async reload(servers: Record<string, McpServerConfig> = {}): Promise<LoadedMcpServer[]> {
    const previous = this.active.splice(0);
    for (const entry of previous.reverse()) { entry.dispose(); await entry.client.disconnect().catch(() => undefined); }
    const active: Array<{ dispose: RegistryDisposer; client: McpConnection }> = []; const results: LoadedMcpServer[] = [];
    for (const [name, config] of Object.entries(servers)) { const loaded = await loadServer(name, config, this.tools); results.push(loaded.result); if (loaded.dispose && loaded.client) active.push({ dispose: loaded.dispose, client: loaded.client }); }
    this.active = active; this.results = results; return this.list();
  }
  async test(name: string, config: McpServerConfig): Promise<LoadedMcpServer> {
    const client: McpConnection = isHttpMcpConfig(config) ? new HttpMcpClient(config) : new McpClient(config);
    try { await client.connect(); const remoteTools = await client.listTools(); return { name, toolCount: remoteTools.length, status: "loaded" }; }
    catch (error) { return { name, toolCount: 0, status: "failed", error: (error as Error).message }; }
    finally { await client.disconnect().catch(() => undefined); }
  }
  async dispose(): Promise<void> { await this.reload({}); }
}
