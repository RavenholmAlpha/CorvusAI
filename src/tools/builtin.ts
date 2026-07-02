import { execFile } from "node:child_process";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import type { JsonObject, JsonSchema } from "../types.js";
import {
  createToolManifest,
  type ToolConcurrency,
  type ToolManifest,
} from "./protocol.js";

const execFileAsync = promisify(execFile);
const BUILT_IN_VERSION = "1.0.0";
const DEFAULT_CONCURRENCY: ToolConcurrency = { perTool: 1, perRun: 1, global: 1 };

type ReadFileInput = JsonObject & { path: string; maxBytes?: number };
type WriteFileInput = JsonObject & { path: string; content: string };
type ListDirInput = JsonObject & { path?: string };
type ShellInput = JsonObject & { command: string; cwd?: string; timeoutMs?: number };
type WebFetchInput = JsonObject & { url: string; method?: string; body?: string };
type EmptyInput = JsonObject;

interface BuiltInToolDefinition<TInput extends JsonObject>
  extends Omit<ToolManifest<TInput>, "version" | "concurrency" | "resources" | "toOpenAITool"> {
  version?: string;
  concurrency?: ToolConcurrency;
  resources?: string[];
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
        const resolved = resolve(path);
        const content = await readFile(resolved, "utf8");
        const limit = Number(maxBytes ?? context.outputLimitBytes);
        return {
          ok: true,
          output: {
            path: resolved,
            content: content.slice(0, limit),
            truncated: content.length > limit,
          },
        };
      },
    }),
    builtInTool<WriteFileInput>({
      name: "write_file",
      namespace: "filesystem",
      description: "Write UTF-8 text to a file, creating parent directories if needed.",
      capability: "filesystem.write",
      risk: "medium",
      parameters: objectSchema(
        {
          path: stringSchema("File path to write."),
          content: stringSchema("Text content to write."),
        },
        ["path", "content"],
      ),
      timeoutMs: 10000,
      outputLimitBytes: 4000,
      evidencePolicy: "summary",
      resources: ["filesystem.write"],
      execute: async ({ path, content }) => {
        const resolved = resolve(path);
        await mkdir(dirname(resolved), { recursive: true });
        await writeFile(resolved, content, "utf8");
        return { ok: true, output: { path: resolved, bytes: Buffer.byteLength(content, "utf8") } };
      },
    }),
    builtInTool<ListDirInput>({
      name: "list_dir",
      namespace: "filesystem",
      description: "List files and directories at a path.",
      capability: "filesystem.read",
      risk: "low",
      parameters: objectSchema({
        path: stringSchema("Directory path. Defaults to current working directory."),
      }),
      timeoutMs: 10000,
      outputLimitBytes: 12000,
      evidencePolicy: "summary",
      resources: ["filesystem.read"],
      execute: async ({ path = "." }) => {
        const resolved = resolve(path);
        const entries = await readdir(resolved, { withFileTypes: true });
        return {
          ok: true,
          output: entries.map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
          })),
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
        const shell = process.platform === "win32" ? "powershell.exe" : "sh";
        const args =
          process.platform === "win32" ? ["-NoProfile", "-Command", command] : ["-lc", command];
        const result = await execFileAsync(shell, args, {
          cwd: cwd ?? context.cwd,
          timeout: Number(timeoutMs ?? context.timeoutMs),
          maxBuffer: 1024 * 1024,
        });
        return { ok: true, output: { stdout: result.stdout, stderr: result.stderr } };
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
        const response = await fetch(url, {
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
