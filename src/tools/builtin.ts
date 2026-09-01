import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { enforcePathSandbox, enforceShellSandbox } from "../sandbox-enforce.js";
import type { ScopeLeaseCoordinator } from "../collaboration.js";
import { assertSafeUrl } from "../network-policy.js";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { JsonObject, JsonSchema } from "../types.js";
import {
  createToolManifest,
  type ToolConcurrency,
  type ToolManifest,
} from "./protocol.js";

const execFileAsync = promisify(execFile);
const BUILT_IN_VERSION = "1.0.0";

// Sub-agent factory: set by cli.ts so the task tool can spawn isolated agents.
type SubAgentFactory = (prompt: string, description?: string, parentRunId?: string, profile?: string, role?: string) => Promise<string>;
type ParallelTaskInput = { prompt: string; description?: string; profile?: string; role?: string };
type SubAgentBatchFactory = (tasks: ParallelTaskInput[], parentRunId?: string) => Promise<Array<{ result?: string; error?: string; profile?: string }>>;
let subAgentFactory: SubAgentFactory | undefined;
let subAgentBatchFactory: SubAgentBatchFactory | undefined;
let scopeLeaseCoordinator: ScopeLeaseCoordinator | undefined;

export type WorkspaceInfo = { id: string; name: string; path: string; lastSessionId?: string | null };
export type WorkspaceLister = () => Promise<WorkspaceInfo[]> | WorkspaceInfo[];
export type WorkspaceRegistrar = (name: string, path: string) => Promise<WorkspaceInfo> | WorkspaceInfo;
export type ProjectTaskDispatcher = (projectId: string, prompt: string, description?: string, roleId?: string, parentRunId?: string, background?: boolean) => Promise<string>;
export type MemorySearcher = (query: string, projectId?: string) => Promise<Array<{ title: string; content: string; kind: string; projectId: string }>>;
export type McpManager = (input: { action: "list" | "add" | "remove" | "test" | "import"; name?: string; config?: JsonObject; dryRun?: boolean }) => Promise<unknown>;
export type SkillManager = (input: { action: "create" | "list" | "delete"; id?: string; content?: string; tier?: "global" | "workspace"; workspace?: string; overwrite?: boolean }) => Promise<unknown>;
export type ProjectMemoryRecorder = (input: { kind: "architecture" | "decision" | "pitfall" | "convention" | "handoff"; title: string; content: string; scope: "global" | "project"; projectId?: string }) => Promise<unknown>;
export type WorkspaceUnregistrar = (projectId: string) => Promise<unknown> | unknown;
export type WorkspaceSummaryGetter = (projectId?: string) => Promise<unknown>;
export type SubagentTaskChecker = (taskId: string) => Promise<unknown> | unknown;
export type RoleManager = (input: { action: "list" | "create" | "update" | "delete"; id?: string; role?: JsonObject }) => Promise<unknown>;

let workspaceLister: WorkspaceLister | undefined;
let workspaceRegistrar: WorkspaceRegistrar | undefined;
let projectTaskDispatcher: ProjectTaskDispatcher | undefined;
let memorySearcher: MemorySearcher | undefined;
let mcpManager: McpManager | undefined;
let skillManager: SkillManager | undefined;
let projectMemoryRecorder: ProjectMemoryRecorder | undefined;
let workspaceUnregistrar: WorkspaceUnregistrar | undefined;
let workspaceSummaryGetter: WorkspaceSummaryGetter | undefined;
let subagentTaskChecker: SubagentTaskChecker | undefined;
let roleManager: RoleManager | undefined;

export function setSubAgentFactory(factory: SubAgentFactory): void {
  subAgentFactory = factory;
}

export function setSubAgentBatchFactory(factory: SubAgentBatchFactory): void {
  subAgentBatchFactory = factory;
}

export function setScopeLeaseCoordinator(coordinator: ScopeLeaseCoordinator | undefined): void {
  scopeLeaseCoordinator = coordinator;
}

export function setWorkspaceLister(lister: WorkspaceLister): void {
  workspaceLister = lister;
}

export function setWorkspaceRegistrar(registrar: WorkspaceRegistrar): void {
  workspaceRegistrar = registrar;
}

export function setProjectTaskDispatcher(dispatcher: ProjectTaskDispatcher): void {
  projectTaskDispatcher = dispatcher;
}

export function setMemorySearcher(searcher: MemorySearcher): void { memorySearcher = searcher; }
export function setMcpManager(manager: McpManager): void { mcpManager = manager; }
export function setSkillManager(manager: SkillManager): void { skillManager = manager; }
export function setProjectMemoryRecorder(recorder: ProjectMemoryRecorder): void { projectMemoryRecorder = recorder; }
export function setWorkspaceUnregistrar(unregistrar: WorkspaceUnregistrar): void { workspaceUnregistrar = unregistrar; }
export function setWorkspaceSummaryGetter(getter: WorkspaceSummaryGetter): void { workspaceSummaryGetter = getter; }
export function setSubagentTaskChecker(checker: SubagentTaskChecker): void { subagentTaskChecker = checker; }
export function setRoleManager(manager: RoleManager): void { roleManager = manager; }
const DEFAULT_CONCURRENCY: ToolConcurrency = { perTool: 1, perRun: 1, global: 1 };

type ReadFileInput = JsonObject & { path: string; maxBytes?: number };
type WriteFileInput = JsonObject & { path: string; content: string };
type ListDirInput = JsonObject & { path?: string };
type ShellInput = JsonObject & { command: string; cwd?: string; timeoutMs?: number };
type ReplaceFileInput = JsonObject & { path: string; targetContent: string; replacementContent: string };
type PatchFileInput = JsonObject & { path: string; search: string; replace: string };
type GrepSearchInput = JsonObject & { query: string; path?: string; caseInsensitive?: boolean };
type WebFetchInput = JsonObject & { url: string; method?: string; body?: string };
type EmptyInput = JsonObject;

interface BuiltInToolDefinition<TInput extends JsonObject>
  extends Omit<ToolManifest<TInput>, "version" | "concurrency" | "resources" | "toOpenAITool"> {
  version?: string;
  concurrency?: ToolConcurrency;
  resources?: string[];
}

function getPlatformShell(): { shell: string; args: (command: string) => string[] } {
  if (process.platform === "win32") {
    const sysRoot = process.env.SystemRoot || process.env.WINDIR || process.env.systemroot || process.env.windir || "C:\\Windows";
    const psCandidate = join(sysRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const cmdCandidate = process.env.ComSpec || process.env.COMSPEC || process.env.comspec || join(sysRoot, "System32", "cmd.exe");

    if (existsSync(psCandidate)) {
      return {
        shell: psCandidate,
        args: (cmd) => ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd],
      };
    }
    if (existsSync(cmdCandidate)) {
      return {
        shell: cmdCandidate,
        args: (cmd) => ["/d", "/s", "/c", cmd],
      };
    }
    return {
      shell: "cmd.exe",
      args: (cmd) => ["/d", "/s", "/c", cmd],
    };
  }
  return {
    shell: "sh",
    args: (cmd) => ["-lc", cmd],
  };
}

export function createBuiltInToolManifests(): ToolManifest[] {
  return [
    builtInTool<ReadFileInput>({
      name: "read_file",
      namespace: "filesystem",
      description: "Read a UTF-8 text file from the workspace or an absolute path.",
      capability: "filesystem.read",
      risk: "low",
      parameters: objectSchema(
        {
          path: stringSchema("File path to read."),
          maxBytes: numberSchema("Maximum number of bytes to return. Defaults to 12000."),
        },
        ["path"],
      ),
      timeoutMs: 10000,
      outputLimitBytes: 12000,
      evidencePolicy: "summary",
      resources: ["filesystem.read"],
      execute: async ({ path, maxBytes }, context) => {
        const resolved = resolve(context.cwd, path);
        const content = await readFile(resolved, "utf8");
        const limit = Number(maxBytes ?? context.outputLimitBytes);
        return {
          ok: true,
          output: {
            path: resolved,
            content: truncateString(content, limit),
            truncated: content.length > limit,
          },
        };
      },
    }),
    builtInTool<WriteFileInput>({
      name: "write_file",
      namespace: "filesystem",
      description: "Write content to a file in the workspace, creating parent directories if needed.",
      capability: "filesystem.write",
      risk: "medium",
      parameters: objectSchema(
        {
          path: stringSchema("File path to write."),
          content: stringSchema("File content to write."),
        },
        ["path", "content"],
      ),
      timeoutMs: 10000,
      outputLimitBytes: 4000,
      evidencePolicy: "summary",
      resources: ["filesystem.write"],
      execute: async ({ path, content }, context) => {
        const resolved = resolve(context.cwd, path);
        const sandboxError = enforcePathSandbox(resolved);
        if (sandboxError) {
          return { ok: false, error: sandboxError };
        }
        await mkdir(dirname(resolved), { recursive: true });
        await writeFile(resolved, content, "utf8");
        return { ok: true, output: { path: resolved, writtenBytes: Buffer.byteLength(content, "utf8"), bytes: Buffer.byteLength(content, "utf8") } };
      },
    }),
    builtInTool<ListDirInput>({
      name: "list_dir",
      namespace: "filesystem",
      description: "List directory contents in the workspace.",
      capability: "filesystem.read",
      risk: "low",
      parameters: objectSchema({
        path: stringSchema("Directory path to list. Defaults to current workspace root.") as JsonSchema,
      }),
      timeoutMs: 10000,
      outputLimitBytes: 8000,
      evidencePolicy: "summary",
      resources: ["filesystem.read"],
      execute: async ({ path }, context) => {
        const resolved = resolve(context.cwd, path ?? ".");
        const entries = await readdir(resolved, { withFileTypes: true });
        return {
          ok: true,
          output: {
            entries: entries.map((entry) => ({
              name: entry.name,
              type: entry.isDirectory() ? "directory" : "file",
            })),
          },
        };
      },
    }),
    builtInTool<ShellInput>({
      name: "shell",
      namespace: "shell",
      description: "Run a shell command after permission approval.",
      capability: "process",
      risk: "high",
      parameters: objectSchema(
        {
          command: stringSchema("Command line to execute."),
          cwd: stringSchema("Working directory. Defaults to current directory."),
          timeoutMs: numberSchema("Timeout in milliseconds. Defaults to 30000."),
        },
        ["command"],
      ),
      timeoutMs: 30000,
      outputLimitBytes: 20000,
      evidencePolicy: "full_if_error",
      resources: ["process"],
      execute: async ({ command, cwd, timeoutMs }, context) => {
        const sandboxError = enforceShellSandbox(command);
        if (sandboxError) {
          return { ok: false, error: sandboxError };
        }
        const { shell, args } = getPlatformShell();
        let effectiveCwd = cwd ?? context.cwd ?? process.cwd();
        try {
          if (!effectiveCwd || !existsSync(effectiveCwd)) {
            effectiveCwd = process.cwd();
          }
        } catch {
          effectiveCwd = process.cwd();
        }

        const env = {
          ...process.env,
          SystemRoot: process.env.SystemRoot || process.env.WINDIR || process.env.systemroot || process.env.windir || "C:\\Windows",
          WINDIR: process.env.WINDIR || process.env.SystemRoot || process.env.windir || process.env.systemroot || "C:\\Windows",
          ComSpec: process.env.ComSpec || process.env.COMSPEC || process.env.comspec || "C:\\Windows\\System32\\cmd.exe",
          PATH: process.env.PATH || process.env.Path || "",
          Path: process.env.Path || process.env.PATH || "",
        };

        let stdout = "";
        let stderr = "";
        try {
          const result = await execFileAsync(shell, args(command), {
            cwd: effectiveCwd,
            timeout: Number(timeoutMs ?? context.timeoutMs),
            signal: context.signal,
            env,
            windowsHide: true,
            maxBuffer: 1024 * 1024 * 5, // 5MB limit
          });
          stdout = result.stdout;
          stderr = result.stderr;
        } catch (e: any) {
          if (process.platform === "win32") {
            try {
              const sysRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
              const cmdPath = process.env.ComSpec || process.env.COMSPEC || join(sysRoot, "System32", "cmd.exe");
              const fallbackResult = await execFileAsync(cmdPath, ["/d", "/s", "/c", command], {
                cwd: effectiveCwd,
                timeout: Number(timeoutMs ?? context.timeoutMs),
                signal: context.signal,
                env,
                windowsHide: true,
                maxBuffer: 1024 * 1024 * 5,
              });
              stdout = fallbackResult.stdout;
              stderr = fallbackResult.stderr;
            } catch (fallbackError: any) {
              stdout = fallbackError.stdout || "";
              stderr = fallbackError.stderr || fallbackError.message;
            }
          } else {
            stdout = e.stdout || "";
            stderr = e.stderr || e.message;
          }
        }
        
        const limit = context.outputLimitBytes;
        const truncatedStdout = truncateString(stdout, limit);
        const truncatedStderr = truncateString(stderr, limit);
        
        return { 
          ok: true, 
          output: { 
            stdout: truncatedStdout, 
            stderr: truncatedStderr,
          } 
        };
      },
    }),
    builtInTool<ReplaceFileInput>({
      name: "replace_file_content",
      namespace: "filesystem",
      description: "Replace exact substring matches in a file.",
      capability: "filesystem.write",
      risk: "medium",
      parameters: objectSchema(
        {
          path: stringSchema("File path to modify."),
          targetContent: stringSchema("Exact string to replace (must match perfectly including whitespace)."),
          replacementContent: stringSchema("New content to insert."),
        },
        ["path", "targetContent", "replacementContent"],
      ),
      timeoutMs: 10000,
      outputLimitBytes: 4000,
      evidencePolicy: "summary",
      resources: ["filesystem.write"],
      execute: async ({ path, targetContent, replacementContent }, context) => {
        const resolved = resolve(context.cwd, path);
        try { scopeLeaseCoordinator?.claimPath(resolved); } catch (error) { return { ok: false, error: (error as Error).message }; }
        const content = await readFile(resolved, "utf8");
        const occurrences = content.split(targetContent).length - 1;
        
        if (occurrences === 0) {
          return { ok: false, error: "Target content not found in file. Ensure exact match including whitespace." };
        }
        
        const newContent = content.replaceAll(targetContent, replacementContent);
        await writeFile(resolved, newContent, "utf8");
        return { ok: true, output: { path: resolved, occurrencesReplaced: occurrences } };
      },
    }),
    builtInTool<PatchFileInput>({
      name: "patch_file",
      namespace: "filesystem",
      description: "Fuzzy replace a block of text in a file. Ignores leading/trailing whitespace on each line during matching.",
      capability: "filesystem.write",
      risk: "medium",
      parameters: objectSchema(
        {
          path: stringSchema("File path to modify."),
          search: stringSchema("Text to search for (whitespace on edges of each line is ignored)."),
          replace: stringSchema("Replacement text."),
        },
        ["path", "search", "replace"],
      ),
      timeoutMs: 10000,
      outputLimitBytes: 4000,
      evidencePolicy: "summary",
      resources: ["filesystem.write"],
      execute: async ({ path, search, replace }, context) => {
        const resolved = resolve(context.cwd, path);
        try { scopeLeaseCoordinator?.claimPath(resolved); } catch (error) { return { ok: false, error: (error as Error).message }; }
        const content = await readFile(resolved, "utf8");
        const fileLines = content.split(/\r?\n/);
        const searchLines = search.split(/\r?\n/).map(l => l.trim());
        const replaceLines = replace.split(/\r?\n/);

        let matchIndex = -1;
        let matchCount = 0;

        for (let i = 0; i <= fileLines.length - searchLines.length; i++) {
          let matches = true;
          for (let j = 0; j < searchLines.length; j++) {
            if (fileLines[i + j].trim() !== searchLines[j]) {
              matches = false;
              break;
            }
          }
          if (matches) {
            matchIndex = i;
            matchCount++;
          }
        }

        if (matchCount === 0) {
          return { ok: false, error: "Search block not found in file." };
        }
        if (matchCount > 1) {
          return { ok: false, error: `Search block found ${matchCount} times. Please make the search block more specific.` };
        }

        fileLines.splice(matchIndex, searchLines.length, ...replaceLines);
        await writeFile(resolved, fileLines.join("\n"), "utf8");
        return { ok: true, output: { path: resolved, linesReplaced: searchLines.length, newLines: replaceLines.length } };
      },
    }),
    builtInTool<GrepSearchInput>({
      name: "grep_search",
      namespace: "filesystem",
      description: "Search for a pattern in files within a directory.",
      capability: "filesystem.read",
      risk: "low",
      parameters: objectSchema(
        {
          query: stringSchema("Regex or string pattern to search for."),
          path: stringSchema("Directory to search. Defaults to current directory."),
          caseInsensitive: { type: "boolean", description: "Ignore case." } as JsonSchema,
        },
        ["query"],
      ),
      timeoutMs: 30000,
      outputLimitBytes: 20000,
      evidencePolicy: "summary",
      resources: ["filesystem.read"],
      execute: async ({ query, path, caseInsensitive }, context) => {
        let effectiveCwd = context.cwd ?? process.cwd();
        try {
          if (!effectiveCwd || !existsSync(effectiveCwd)) {
            effectiveCwd = process.cwd();
          }
        } catch {
          effectiveCwd = process.cwd();
        }

        const env = {
          ...process.env,
          SystemRoot: process.env.SystemRoot || process.env.WINDIR || process.env.systemroot || process.env.windir || "C:\\Windows",
          WINDIR: process.env.WINDIR || process.env.SystemRoot || process.env.windir || process.env.systemroot || "C:\\Windows",
          ComSpec: process.env.ComSpec || process.env.COMSPEC || process.env.comspec || "C:\\Windows\\System32\\cmd.exe",
          PATH: process.env.PATH || process.env.Path || "",
          Path: process.env.Path || process.env.PATH || "",
        };

        const { shell, args } = getPlatformShell();
        let queryArgs: string[];
        if (process.platform === "win32") {
          const ignoreCaseFlag = caseInsensitive !== false ? "" : "-CaseSensitive ";
          queryArgs = args(`Select-String ${ignoreCaseFlag}-Pattern "${query.replace(/"/g, '`"')}" -Path "${resolve(effectiveCwd, path ?? ".")}/*" -Recurse | Select-Object -First 50 | Format-Table LineNumber, Path, Line -HideTableHeaders`);
        } else {
          const ignoreCaseFlag = caseInsensitive !== false ? "-i" : "";
          queryArgs = args(`grep -rn ${ignoreCaseFlag} -m 50 "${query.replace(/"/g, '\\"')}" "${resolve(effectiveCwd, path ?? ".")}"`);
        }
        
        let stdout = "";
        try {
          const result = await execFileAsync(shell, queryArgs, {
            cwd: effectiveCwd,
            timeout: Number(context.timeoutMs),
            env,
            windowsHide: true,
            maxBuffer: 1024 * 1024 * 2,
          });
          stdout = result.stdout;
        } catch (e: any) {
          if (e.code === 1) {
            // grep returns 1 if no lines were selected, which is fine
            stdout = "";
          } else {
            stdout = e.stdout || e.message;
          }
        }
        
        return { ok: true, output: { matches: truncateString(stdout.trim() || "No matches found.", context.outputLimitBytes) } };
      },
    }),
    builtInTool<WebFetchInput>({
      name: "web_fetch",
      namespace: "web",
      description: "Fetch a URL and return status, headers, and a text preview.",
      capability: "network",
      risk: "medium",
      parameters: objectSchema(
        {
          url: stringSchema("URL to fetch."),
          method: stringSchema("HTTP method. Defaults to GET."),
          body: stringSchema("Optional request body."),
        },
        ["url"],
      ),
      timeoutMs: 30000,
      outputLimitBytes: 20000,
      evidencePolicy: "summary",
      resources: ["network"],
      execute: async ({ url, method = "GET", body }, context) => {
        const safeUrl = await assertSafeUrl(url);
        const response = await fetch(safeUrl, {
          method,
          body,
          signal: context.signal,
        });
        const text = await response.text();
        return {
          ok: true,
          output: {
            status: response.status,
            contentType: response.headers.get("content-type"),
            text: text.slice(0, context.outputLimitBytes),
            truncated: text.length > context.outputLimitBytes,
          },
        };
      },
    }),
    builtInTool<EmptyInput>({
      name: "now",
      namespace: "local",
      description: "Return the current time in ISO-8601 format.",
      capability: "local",
      risk: "low",
      parameters: objectSchema({}),
      timeoutMs: 1000,
      outputLimitBytes: 1000,
      evidencePolicy: "none",
      resources: ["clock"],
      execute: () => ({ ok: true, output: { iso: new Date().toISOString() } }),
    }),
    builtInTool<{ prompt: string; description?: string; profile?: string; role?: string }>({
      name: "task",
      namespace: "agent",
      description:
        "Delegate a self-contained sub-task to a fresh agent with an isolated context. " +
        "Use this for focused work (e.g. analyze one file, write a function) so the main " +
        "conversation stays compact. The sub-agent has the same tools but its own history.",
      capability: "local",
      risk: "low",
      parameters: objectSchema(
        {
          prompt: stringSchema("The task prompt for the sub-agent."),
          description: stringSchema("A short label for this sub-task (optional).") as JsonSchema,
          profile: stringSchema("Optional legacy model profile ID.") as JsonSchema,
          role: stringSchema("Optional reusable agent role ID. Roles select a provider and may override its model.") as JsonSchema,
        },
        ["prompt"],
      ),
      timeoutMs: 300000,
      outputLimitBytes: 20000,
      evidencePolicy: "summary",
      resources: ["agent"],
      execute: async ({ prompt, description, profile, role }, context) => {
        if (!subAgentFactory) {
          return { ok: false, error: "Sub-agent delegation is not available in this mode." };
        }
        try {
          const result = await subAgentFactory(prompt, description, context.runId, profile, role);
          return { ok: true, output: { result }, summary: "Sub-agent completed: " + prompt.slice(0, 80) };
        } catch (e: any) {
          return { ok: false, error: "Sub-agent failed: " + e.message };
        }
      },
    }),
    builtInTool<{ tasks: Array<{ prompt: string; description?: string; profile?: string; role?: string }> } & JsonObject>({
      name: "parallel_tasks",
      namespace: "agent",
      description:
        "Delegate 2 to 8 independent sub-tasks concurrently. Use only when tasks do not depend on each other. " +
        "Each task gets an isolated child session; results are returned in input order. Use task for dependent work.",
      capability: "local",
      risk: "low",
      parameters: objectSchema({
        tasks: {
          type: "array",
          description: "Independent sub-tasks to run concurrently (2-8).",
          items: objectSchema({
            prompt: stringSchema("The self-contained task prompt."),
            description: stringSchema("Short optional label."),
            profile: stringSchema("Optional legacy model profile ID."),
            role: stringSchema("Optional reusable agent role ID."),
          }, ["prompt"]),
        } as JsonSchema,
      }, ["tasks"]),
      timeoutMs: 300000,
      outputLimitBytes: 40000,
      evidencePolicy: "summary",
      resources: ["agent"],
      execute: async ({ tasks }, context) => {
        if (!subAgentBatchFactory) {
          return { ok: false, error: "Parallel sub-agent delegation is not available in this mode." };
        }
        if (!Array.isArray(tasks) || tasks.length < 2 || tasks.length > 8) {
          return { ok: false, error: "parallel_tasks requires between 2 and 8 tasks." };
        }
        const normalized = tasks.map((task) => ({ prompt: String(task.prompt ?? ""), description: task.description, profile: task.profile, role: task.role }));
        if (normalized.some((task) => !task.prompt.trim())) {
          return { ok: false, error: "Every parallel task requires a non-empty prompt." };
        }
        const results = await subAgentBatchFactory(normalized, context.runId);
        return {
          ok: true,
          output: { results },
          summary: "Completed " + results.filter((result) => !result.error).length + "/" + results.length + " parallel sub-tasks",
        };
      },
    }),
    builtInTool<EmptyInput & { path?: string }>({
      name: "git_status",
      namespace: "git",
      description:
        "Show the working tree status (modified/untracked files) and current branch. " +
        "Use this to see what changed before committing.",
      capability: "local",
      risk: "low",
      parameters: objectSchema({
        path: stringSchema("Repository directory. Defaults to current directory.") as JsonSchema,
      }),
      timeoutMs: 10000,
      outputLimitBytes: 10000,
      evidencePolicy: "summary",
      resources: ["git"],
      execute: async ({ path }, context) => {
        const cwd = path ? resolve(context.cwd, path) : context.cwd;
        try {
          const branch = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, timeout: 5000, env: { ...process.env } });
          const status = await execFileAsync("git", ["status", "--short"], { cwd, timeout: 5000, env: { ...process.env } });
          return {
            ok: true,
            output: {
              branch: branch.stdout.trim(),
              status: status.stdout.trim() || "(clean)",
            },
          };
        } catch (e: any) {
          return { ok: false, error: "Not a git repository or git unavailable: " + (e.message ?? String(e)) };
        }
      },
    }),
    builtInTool<EmptyInput>({
      name: "list_workspaces",
      namespace: "orchestrator",
      description:
        "List all registered project workspaces available in Corvus. " +
        "Returns project ID, name, directory path, and last active session. " +
        "Use this to discover where to dispatch project-specific coding or auditing tasks.",
      capability: "local",
      risk: "low",
      parameters: objectSchema({}),
      timeoutMs: 10000,
      outputLimitBytes: 10000,
      evidencePolicy: "summary",
      resources: ["orchestrator"],
      execute: async () => {
        if (!workspaceLister) {
          return { ok: false, error: "Workspace discovery is not available in this runtime." };
        }
        try {
          const workspaces = await workspaceLister();
          return {
            ok: true,
            output: { workspaces },
            summary: `Found ${workspaces.length} registered workspace(s)`,
          };
        } catch (e: any) {
          return { ok: false, error: "Failed to list workspaces: " + (e.message ?? String(e)) };
        }
      },
    }),
    builtInTool<{ projectId: string; prompt: string; description?: string; role?: string; background?: boolean }>({
      name: "dispatch_project_task",
      namespace: "orchestrator",
      description:
        "Dispatch a specialized coding, refactoring, or analysis task to a specific project workspace. " +
        "The project agent will execute in the target workspace directory with its own isolated context and tools, " +
        "then return the results back to the master agent.",
      capability: "local",
      risk: "low",
      parameters: objectSchema(
        {
          projectId: stringSchema("The target workspace/project ID or name (use list_workspaces to discover IDs)."),
          prompt: stringSchema("The detailed instructions for the project subagent."),
          description: stringSchema("Short descriptive title for this task (optional).") as JsonSchema,
          role: stringSchema("Optional specialized agent role ID (e.g. 'coder', 'auditor').") as JsonSchema,
          background: { type: "boolean", description: "Return a task ID immediately and run asynchronously; query it with check_subagent_task." } as JsonSchema,
        },
        ["projectId", "prompt"],
      ),
      timeoutMs: 300000,
      outputLimitBytes: 30000,
      evidencePolicy: "summary",
      resources: ["orchestrator"],
      execute: async ({ projectId, prompt, description, role, background }, context) => {
        if (!projectTaskDispatcher) {
          return { ok: false, error: "Project task dispatcher is not available in this runtime." };
        }
        try {
          const result = await projectTaskDispatcher(projectId, prompt, description, role, context.runId, background);
          return {
            ok: true,
            output: { result },
            summary: background ? `Task dispatched to project [${projectId}] in background: ${result}` : `Task dispatched to project [${projectId}] completed`,
          };
        } catch (e: any) {
          return { ok: false, error: `Task on project [${projectId}] failed: ${e.message ?? String(e)}` };
        }
      },
    }),
    builtInTool<{ name: string; path: string }>({
      name: "register_workspace",
      namespace: "orchestrator",
      description:
        "Register a new local filesystem directory as a project workspace in Corvus so it can receive delegated tasks.",
      capability: "local",
      risk: "low",
      parameters: objectSchema(
        {
          name: stringSchema("Human-readable name for the new workspace (e.g. 'Frontend App')."),
          path: stringSchema("Absolute local filesystem path to the project directory."),
        },
        ["name", "path"],
      ),
      timeoutMs: 10000,
      outputLimitBytes: 10000,
      evidencePolicy: "summary",
      resources: ["orchestrator"],
      execute: async ({ name, path }) => {
        if (!workspaceRegistrar) {
          return { ok: false, error: "Workspace registration is not available in this runtime." };
        }
        try {
          const workspace = await workspaceRegistrar(name, path);
          return {
            ok: true,
            output: { workspace },
            summary: `Registered workspace '${workspace.name}' (${workspace.id}) at ${workspace.path}`,
          };
        } catch (e: any) {
          return { ok: false, error: "Failed to register workspace: " + (e.message ?? String(e)) };
        }
      },
    }),
    builtInTool<{ action: "list" | "create" | "update" | "delete"; id?: string; role?: JsonObject }>({
      name: "manage_role", namespace: "orchestrator", description: "List, create, update, or delete reusable agent roles. Use role IDs with task, parallel_tasks, or dispatch_project_task.", capability: "local", risk: "medium",
      parameters: objectSchema({
        action: { type: "string", enum: ["list", "create", "update", "delete"] } as JsonSchema,
        id: stringSchema("Role ID. Required for create, update, and delete."),
        role: { type: "object", description: "Role fields: label, providerId, model, systemPrompt, temperature, allowedTools, deniedTools, skills, and execution limits." } as JsonSchema,
      }, ["action"]),
      timeoutMs: 10000, outputLimitBytes: 20000, evidencePolicy: "summary", resources: ["orchestrator"],
      execute: async (input) => roleManager ? { ok: true, output: await roleManager(input) } : { ok: false, error: "Role management is not available in this runtime." },
    }),
    builtInTool<{ action: "list" | "add" | "remove" | "test" | "import"; name?: string; config?: JsonObject; dryRun?: boolean }>({
      name: "manage_mcp", namespace: "orchestrator", description: "List, add, remove, test, or import MCP server configurations and hot-reload MCP tools.", capability: "local", risk: "medium",
      parameters: objectSchema({ action: { type: "string", enum: ["list", "add", "remove", "test", "import"] } as JsonSchema, name: stringSchema("MCP server name."), config: { type: "object", description: "MCP server configuration." } as JsonSchema, dryRun: { type: "boolean", description: "Preview an import without saving." } as JsonSchema }, ["action"]),
      timeoutMs: 70000, outputLimitBytes: 20000, evidencePolicy: "summary", resources: ["orchestrator"],
      execute: async (input) => mcpManager ? { ok: true, output: await mcpManager(input) } : { ok: false, error: "MCP management is not available in this runtime." },
    }),
    builtInTool<{ action: "create" | "list" | "delete"; id?: string; content?: string; tier?: "global" | "workspace"; workspace?: string; overwrite?: boolean }>({
      name: "manage_skill", namespace: "orchestrator", description: "Create, list, or delete global and workspace skills.", capability: "local", risk: "medium",
      parameters: objectSchema({ action: { type: "string", enum: ["create", "list", "delete"] } as JsonSchema, id: stringSchema("Skill ID."), content: stringSchema("Complete SKILL.md content."), tier: { type: "string", enum: ["global", "workspace"] } as JsonSchema, workspace: stringSchema("Workspace root for a workspace skill."), overwrite: { type: "boolean" } as JsonSchema }, ["action"]),
      timeoutMs: 10000, outputLimitBytes: 15000, evidencePolicy: "summary", resources: ["orchestrator"],
      execute: async (input) => skillManager ? { ok: true, output: await skillManager(input) } : { ok: false, error: "Skill management is not available in this runtime." },
    }),
    builtInTool<{ kind: "architecture" | "decision" | "pitfall" | "convention" | "handoff"; title: string; content: string; scope: "global" | "project"; projectId?: string }>({
      name: "record_project_memory", namespace: "orchestrator", description: "Record architecture, decision, pitfall, convention, or handoff memory at global or project scope.", capability: "local", risk: "low",
      parameters: objectSchema({ kind: { type: "string", enum: ["architecture", "decision", "pitfall", "convention", "handoff"] } as JsonSchema, title: stringSchema("Memory title."), content: stringSchema("Durable memory content."), scope: { type: "string", enum: ["global", "project"] } as JsonSchema, projectId: stringSchema("Project ID; required for project scope.") }, ["kind", "title", "content", "scope"]),
      timeoutMs: 10000, outputLimitBytes: 15000, evidencePolicy: "summary", resources: ["orchestrator"],
      execute: async (input) => projectMemoryRecorder ? { ok: true, output: await projectMemoryRecorder(input) } : { ok: false, error: "Memory recording is not available in this runtime." },
    }),
    builtInTool<{ projectId: string }>({
      name: "unregister_workspace", namespace: "orchestrator", description: "Unregister a project workspace and its persisted Corvus records without deleting files on disk.", capability: "local", risk: "medium",
      parameters: objectSchema({ projectId: stringSchema("Workspace/project ID.") }, ["projectId"]), timeoutMs: 10000, outputLimitBytes: 10000, evidencePolicy: "summary", resources: ["orchestrator"],
      execute: async ({ projectId }) => workspaceUnregistrar ? { ok: true, output: await workspaceUnregistrar(projectId) } : { ok: false, error: "Workspace removal is not available in this runtime." },
    }),
    builtInTool<{ projectId?: string }>({
      name: "get_workspace_summary", namespace: "orchestrator", description: "Summarize a workspace's git state, detected stack, tasks, and latest architecture memory.", capability: "local", risk: "low",
      parameters: objectSchema({ projectId: stringSchema("Optional workspace/project ID.") }), timeoutMs: 15000, outputLimitBytes: 20000, evidencePolicy: "summary", resources: ["orchestrator"],
      execute: async ({ projectId }) => workspaceSummaryGetter ? { ok: true, output: await workspaceSummaryGetter(projectId) } : { ok: false, error: "Workspace summaries are not available in this runtime." },
    }),
    builtInTool<{ taskId: string }>({
      name: "check_subagent_task", namespace: "agent", description: "Check the durable status, result session, and error for a delegated sub-agent task.", capability: "local", risk: "low",
      parameters: objectSchema({ taskId: stringSchema("Sub-agent task ID.") }, ["taskId"]), timeoutMs: 10000, outputLimitBytes: 10000, evidencePolicy: "summary", resources: ["agent"],
      execute: async ({ taskId }) => subagentTaskChecker ? { ok: true, output: await subagentTaskChecker(taskId) } : { ok: false, error: "Sub-agent task lookup is not available in this runtime." },
    }),
    builtInTool<{ query: string; projectId?: string }>({
      name: "search_global_memory",
      namespace: "orchestrator",
      description:
        "Search shared architecture decisions, pitfalls, and guidelines across all projects or a specific project.",
      capability: "local",
      risk: "low",
      parameters: objectSchema(
        {
          query: stringSchema("The keyword or concept to search for in project memories."),
          projectId: stringSchema("Optional project ID to limit memory search to a single project.") as JsonSchema,
        },
        ["query"],
      ),
      timeoutMs: 10000,
      outputLimitBytes: 15000,
      evidencePolicy: "summary",
      resources: ["orchestrator"],
      execute: async ({ query, projectId }) => {
        if (!memorySearcher) {
          return { ok: false, error: "Memory search is not available in this runtime." };
        }
        try {
          const results = await memorySearcher(query, projectId);
          return {
            ok: true,
            output: { results },
            summary: `Found ${results.length} memory item(s) matching '${query}'`,
          };
        } catch (e: any) {
          return { ok: false, error: "Failed to search memory: " + (e.message ?? String(e)) };
        }
      },
    }),
  ];
}

function builtInTool<TInput extends JsonObject>(
  definition: BuiltInToolDefinition<TInput>,
): ToolManifest<TInput> {
  return createToolManifest({
    ...definition,
    version: definition.version ?? BUILT_IN_VERSION,
    concurrency: definition.concurrency ?? { ...DEFAULT_CONCURRENCY },
    resources: definition.resources ?? [],
  });
}

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function stringSchema(description: string): JsonSchema {
  return { type: "string", description };
}

function numberSchema(description: string): JsonSchema {
  return { type: "number", description };
}

function truncateString(str: string, limit: number): string {
  if (!str) return "";
  if (str.length <= limit) return str;
  const half = Math.floor(limit / 2) - 50;
  if (half <= 0) return str.slice(0, limit);
  return (
    str.slice(0, half) +
    `\n\n... [Truncated ${str.length - limit} bytes] ...\n\n` +
    str.slice(-half)
  );
}
