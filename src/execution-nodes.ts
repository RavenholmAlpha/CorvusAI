import { execFile } from "node:child_process";
import { runRestricted } from "./process-guard.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

export interface ExecutionNode { id: string; label?: string; type: "local" | "ssh" | "docker"; host?: string; user?: string; container?: string; cwd?: string; enabled: boolean; allowedCommands?: string[]; }
export interface NodeStatus { id: string; ok: boolean; detail: string; latencyMs: number; }

function getLocalShell(): { shell: string; args: (command: string) => string[] } {
  if (process.platform === "win32") {
    const sysRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
    const psCandidate = join(sysRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const cmdCandidate = process.env.ComSpec || join(sysRoot, "System32", "cmd.exe");
    if (existsSync(psCandidate)) {
      return { shell: psCandidate, args: (cmd) => ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd] };
    }
    return { shell: cmdCandidate, args: (cmd) => ["/d", "/s", "/c", cmd] };
  }
  return { shell: "sh", args: (cmd) => ["-lc", cmd] };
}

export class ExecutionNodeManager {
  constructor(private readonly nodes: () => Record<string, ExecutionNode>) {}
  list(): ExecutionNode[] { return Object.values(this.nodes()); }
  async test(id: string): Promise<NodeStatus> {
    const node = this.nodes()[id]; if (!node?.enabled) return { id, ok: false, detail: "Node disabled or missing", latencyMs: 0 };
    const started = Date.now();
    try {
      if (node.type === "local") await execFileAsync(process.execPath, ["-e", "process.stdout.write(process.platform)"], { env: { ...process.env } });
      else if (node.type === "ssh") await execFileAsync("ssh", [node.user ? node.user + "@" + node.host : node.host!, "echo corvus-node-ok"], { timeout: 10000, env: { ...process.env } });
      else await execFileAsync("docker", ["exec", node.container!, "sh", "-lc", "echo corvus-node-ok"], { timeout: 10000, env: { ...process.env } });
      return { id, ok: true, detail: "Available", latencyMs: Date.now() - started };
    } catch (error) { return { id, ok: false, detail: (error as Error).message, latencyMs: Date.now() - started }; }
  }
  async execute(id: string, command: string): Promise<{ stdout: string; stderr: string }> {
    const node = this.nodes()[id]; if (!node?.enabled) throw new Error("Node disabled or missing: " + id);
    if (!node.allowedCommands?.length) throw new Error("Execution node requires an allowedCommands policy: " + id);
    const executable=command.trim().split(/\s+/)[0];if(!node.allowedCommands.includes(executable))throw new Error("Command is not allowed on execution node: "+executable);
    if (node.type === "local") {
      const { shell, args } = getLocalShell();
      try {
        return await runRestricted(shell, args(command), { cwd: node.cwd, timeoutMs: 60000, maxOutputBytes: 2 * 1024 * 1024, env: { ...process.env } });
      } catch (e: any) {
        if (process.platform === "win32") {
          const cmdPath = process.env.ComSpec || "cmd.exe";
          return await runRestricted(cmdPath, ["/d", "/s", "/c", command], { cwd: node.cwd, timeoutMs: 60000, maxOutputBytes: 2 * 1024 * 1024, env: { ...process.env } });
        }
        throw e;
      }
    }
    if (node.type === "ssh") return runRestricted("ssh", ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", node.user ? node.user + "@" + node.host : node.host!, command], { timeoutMs: 60000, maxOutputBytes: 2 * 1024 * 1024, env: { ...process.env } });
    return runRestricted("docker", ["exec", node.container!, "sh", "-lc", command], { timeoutMs: 60000, maxOutputBytes: 2 * 1024 * 1024, env: { ...process.env } });
  }
}