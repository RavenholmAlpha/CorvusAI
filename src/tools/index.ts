import { decidePermission, type PermissionDecision, type PermissionPolicy } from "../permissions.js";
import type { JsonObject, JsonSchema, OpenAIToolSchema } from "../types.js";
import { createBuiltInToolManifests } from "./builtin.js";
import {
  createToolManifest,
  type EvidencePolicy,
  type ToolConcurrency,
  type ToolExecutionContext,
  type ToolManifest,
  type ToolRisk,
  type ToolRunResult,
} from "./protocol.js";
import { isToolRunResult, normalizeToolResult, validateToolInput } from "./validation.js";

export { createBuiltInToolManifests } from "./builtin.js";
export * from "./protocol.js";
export * from "./validation.js";

export interface ToolDefinition<TInput extends JsonObject = JsonObject, TResult = unknown> {
  name: string;
  description: string;
  capability: string;
  parameters: JsonSchema;
  execute: (input: TInput) => Promise<TResult> | TResult;
  namespace?: string;
  version?: string;
  risk?: ToolRisk;
  timeoutMs?: number;
  outputLimitBytes?: number;
  concurrency?: ToolConcurrency;
  evidencePolicy?: EvidencePolicy;
  resources?: string[];
}

export type RegisterableTool = ToolDefinition | ToolManifest;

export interface ToolPermissionPrompt {
  tool: ToolManifest;
  input: JsonObject;
  decision: PermissionDecision;
}

export type PermissionRequester = (prompt: ToolPermissionPrompt) => Promise<boolean>;

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_OUTPUT_LIMIT_BYTES = 20000;
const DEFAULT_CONCURRENCY: ToolConcurrency = { perTool: 1, perRun: 1, global: 1 };

export class ToolRegistry {
  private readonly tools = new Map<string, ToolManifest>();
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

  register(tool: RegisterableTool): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(tool.name)) {
      throw new Error(`Invalid tool name: ${tool.name}`);
    }
    const manifest = toToolManifest(tool);
    this.tools.set(manifest.name, manifest);
  }

  registerMany(tools: RegisterableTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  list(): ToolManifest[] {
    return [...this.tools.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  toOpenAITools(): OpenAIToolSchema[] {
    return this.list().map((tool) => tool.toOpenAITool());
  }

  async execute(
    name: string,
    input: JsonObject,
    context: Partial<ToolExecutionContext> = {},
  ): Promise<unknown> {
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

    const validatedInput = validateToolInput(tool, input);
    const result = await tool.execute(validatedInput, createExecutionContext(tool, context));
    const normalized = normalizeToolResult(result);
    if (!normalized.ok) {
      throw new Error(normalized.error);
    }
    return normalized.output;
  }
}

export function createBuiltInTools(): ToolManifest[] {
  return createBuiltInToolManifests();
}

function toToolManifest(tool: RegisterableTool): ToolManifest {
  if (isToolManifest(tool)) {
    return tool;
  }

  return createToolManifest({
    name: tool.name,
    namespace: tool.namespace ?? defaultNamespace(tool.capability),
    version: tool.version ?? "1.0.0",
    description: tool.description,
    capability: tool.capability,
    risk: tool.risk ?? "medium",
    parameters: tool.parameters,
    timeoutMs: tool.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    outputLimitBytes: tool.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES,
    concurrency: tool.concurrency ?? { ...DEFAULT_CONCURRENCY },
    evidencePolicy: tool.evidencePolicy ?? "summary",
    resources: tool.resources ?? [],
    execute: async (input) => toToolRunResult(await tool.execute(input)),
  });
}

function isToolManifest(tool: RegisterableTool): tool is ToolManifest {
  return typeof (tool as Partial<ToolManifest>).toOpenAITool === "function";
}

function toToolRunResult(result: unknown): ToolRunResult {
  if (isToolRunResult(result)) {
    return result;
  }
  return { ok: true, output: result };
}

function createExecutionContext(
  tool: ToolManifest,
  overrides: Partial<ToolExecutionContext>,
): ToolExecutionContext {
  const controller = new AbortController();
  return {
    runId: overrides.runId ?? "local",
    toolCallId: overrides.toolCallId ?? `local_${tool.name}`,
    signal: overrides.signal ?? controller.signal,
    cwd: overrides.cwd ?? process.cwd(),
    timeoutMs: overrides.timeoutMs ?? tool.timeoutMs,
    outputLimitBytes: overrides.outputLimitBytes ?? tool.outputLimitBytes,
  };
}

function defaultNamespace(capability: string): string {
  return capability.split(".")[0] || "tool";
}
