import { execFile } from "node:child_process";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { decidePermission, type PermissionDecision, type PermissionPolicy } from "../permissions.js";
import type { JsonObject, JsonSchema, OpenAIToolSchema } from "../types.js";

const execFileAsync = promisify(execFile);

export interface ToolDefinition<TInput extends JsonObject = JsonObject, TResult = unknown> {
  name: string;
  description: string;
  capability: string;
  parameters: JsonSchema;
  execute: (input: TInput) => Promise<TResult> | TResult;
}

export interface ToolPermissionPrompt {
  tool: ToolDefinition;
  input: JsonObject;
  decision: PermissionDecision;
}

export type PermissionRequester = (prompt: ToolPermissionPrompt) => Promise<boolean>;

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private permissionRequester?: PermissionRequester;

  constructor(
    private readonly policy: PermissionPolicy,
    options: { onPermissionRequest?: PermissionRequester } = {},
  ) {
    this.permissionRequester = options.onPermissionRequest;
  }

  setPermissionRequester(requester: PermissionRequester): void {
    this.permissionRequester = requester;
  }

  register(tool: ToolDefinition): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(tool.name)) {
      throw new Error(`Invalid tool name: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  toOpenAITools(): OpenAIToolSchema[] {
    return this.list().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async execute(name: string, input: JsonObject): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const decision = decidePermission(this.policy, { toolName: tool.name, capability: tool.capability });
    if (decision === "deny") {
      throw new Error(`Tool ${tool.name} denied by permission policy`);
    }

    if (decision === "ask") {
      const approved = await this.permissionRequester?.({ tool, input, decision });
      if (!approved) {
        throw new Error(`Tool ${tool.name} requires approval`);
      }
    }

    return tool.execute(input);
  }
}

export function createBuiltInTools(): ToolDefinition[] {
  return [
    {
      name: "read_file",
      description: "Read a UTF-8 text file from the workspace or an absolute path.",
      capability: "filesystem.read",
      parameters: objectSchema({
        path: stringSchema("File path to read."),
        maxBytes: numberSchema("Maximum number of bytes to return. Defaults to 12000."),
      }, ["path"]),
      execute: async ({ path, maxBytes = 12000 }) => {
        const resolved = resolve(String(path));
        const content = await readFile(resolved, "utf8");
        const limit = Number(maxBytes);
        return {
          path: resolved,
          content: content.slice(0, limit),
          truncated: content.length > limit,
        };
      },
    },
    {
      name: "write_file",
      description: "Write UTF-8 text to a file, creating parent directories if needed.",
      capability: "filesystem.write",
      parameters: objectSchema(
        {
          path: stringSchema("File path to write."),
          content: stringSchema("Text content to write."),
        },
        ["path", "content"],
      ),
      execute: async ({ path, content }) => {
        const resolved = resolve(String(path));
        await mkdir(dirname(resolved), { recursive: true });
        await writeFile(resolved, String(content), "utf8");
        return { path: resolved, bytes: Buffer.byteLength(String(content), "utf8") };
      },
    },
    {
      name: "list_dir",
      description: "List files and directories at a path.",
      capability: "filesystem.read",
      parameters: objectSchema({
        path: stringSchema("Directory path. Defaults to current working directory."),
      }),
      execute: async ({ path = "." }) => {
        const resolved = resolve(String(path));
        const entries = await readdir(resolved, { withFileTypes: true });
        return entries.map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
        }));
      },
    },
    {
      name: "shell",
      description: "Run a shell command after permission approval.",
      capability: "process",
      parameters: objectSchema(
        {
          command: stringSchema("Command line to execute."),
          cwd: stringSchema("Working directory. Defaults to current directory."),
          timeoutMs: numberSchema("Timeout in milliseconds. Defaults to 30000."),
        },
        ["command"],
      ),
      execute: async ({ command, cwd = process.cwd(), timeoutMs = 30000 }) => {
        const shell = process.platform === "win32" ? "powershell.exe" : "sh";
        const args =
          process.platform === "win32"
            ? ["-NoProfile", "-Command", String(command)]
            : ["-lc", String(command)];
        const result = await execFileAsync(shell, args, {
          cwd: String(cwd),
          timeout: Number(timeoutMs),
          maxBuffer: 1024 * 1024,
        });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
        };
      },
    },
    {
      name: "web_fetch",
      description: "Fetch a URL and return status, headers, and a text preview.",
      capability: "network",
      parameters: objectSchema(
        {
          url: stringSchema("URL to fetch."),
          method: stringSchema("HTTP method. Defaults to GET."),
          body: stringSchema("Optional request body."),
        },
        ["url"],
      ),
      execute: async ({ url, method = "GET", body }) => {
        const response = await fetch(String(url), {
          method: String(method),
          body: body === undefined ? undefined : String(body),
        });
        const text = await response.text();
        return {
          status: response.status,
          contentType: response.headers.get("content-type"),
          text: text.slice(0, 20000),
          truncated: text.length > 20000,
        };
      },
    },
    {
      name: "now",
      description: "Return the current time in ISO-8601 format.",
      capability: "local",
      parameters: objectSchema({}),
      execute: () => ({ iso: new Date().toISOString() }),
    },
  ];
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

