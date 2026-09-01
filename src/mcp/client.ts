import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
  url?: string;
  headers?: Record<string, string>;
  bearerTokenRef?: string;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Minimal MCP (Model Context Protocol) stdio client.
 * Spawns a server process and communicates via JSON-RPC over stdin/stdout.
 */
export class McpClient {
  private proc: ChildProcessWithoutNullStreams | undefined;
  private buffer = "";
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  constructor(private readonly config: McpServerConfig) {}

  async connect(): Promise<void> {
    if (!this.config.command) throw new Error("MCP stdio config requires command");
    this.proc = spawn(this.config.command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.config.env },
    });

    this.proc.stdout.on("data", (data: Buffer) => {
      this.buffer += data.toString("utf8");
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(line);
        }
      }
    });

    this.proc.once("error", (error) => this.rejectPending(error));
    this.proc.once("exit", (code, signal) => this.rejectPending(new Error(`MCP server exited (${code ?? signal ?? "unknown"})`)));
    this.proc.stderr.on("data", () => { /* Protocol output remains isolated on stdout. */ });

    // Initialize handshake
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "corvus", version: "0.2.0" },
    });
    await this.notify("notifications/initialized");
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.request("tools/list") as { tools?: McpTool[] };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args });
  }

  async disconnect(): Promise<void> {
    this.rejectPending(new Error("MCP client disconnected"));
    this.proc?.kill();
    this.proc = undefined;
  }

  private request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc || this.proc.killed) { reject(new Error("MCP client is not connected")); return; }
      const id = randomUUID();
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`MCP request timed out: ${method}`)); }, this.config.timeoutMs ?? 30000);
      this.pending.set(id, { resolve, reject, timer });
      const msg: JsonRpcRequest = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
      this.proc.stdin.write(JSON.stringify(msg) + "\n");
    });
  }

  private notify(method: string): Promise<void> {
    const msg = { jsonrpc: "2.0", method };
    this.proc?.stdin.write(JSON.stringify(msg) + "\n");
    return Promise.resolve();
  }

  private rejectPending(error: Error): void {
    for (const handler of this.pending.values()) { clearTimeout(handler.timer); handler.reject(error); }
    this.pending.clear();
  }

  private handleMessage(line: string): void {
    try {
      const msg = JSON.parse(line) as JsonRpcResponse;
      const handler = this.pending.get(msg.id);
      if (handler) {
        this.pending.delete(msg.id);
        clearTimeout(handler.timer);
        if (msg.error) {
          handler.reject(new Error(msg.error.message));
        } else {
          handler.resolve(msg.result);
        }
      }
    } catch {
      // Ignore non-JSON lines (server logs, etc.)
    }
  }
}
