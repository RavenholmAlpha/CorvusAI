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
import { normalizeToolResult, validateToolInput } from "./validation.js";

export { createBuiltInToolManifests } from "./builtin.js";
export * from "./protocol.js";
export * from "./validation.js";

export interface ToolDefinition<TInput extends JsonObject = JsonObject, TResult = unknown> {
  name: string;
  description: string;
  capability: string;
  parameters: JsonSchema;
  execute: (input: TInput, context?: ToolExecutionContext) => Promise<TResult> | TResult;
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

export type RegistryDisposer = () => boolean;

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

  register(tool: RegisterableTool): RegistryDisposer {
    if (!/^[a-zA-Z0-9_-]+$/.test(tool.name)) throw new Error(`Invalid tool name: ${tool.name}`);
    const manifest = toToolManifest(tool);
    if (this.tools.has(manifest.name)) throw new Error(`Tool already registered: ${manifest.name}`);
    this.tools.set(manifest.name, manifest);
    let disposed = false;
    return () => { if (disposed) return false; disposed = true; if (this.tools.get(manifest.name) !== manifest) return false; return this.tools.delete(manifest.name); };
  }

  registerMany(tools: RegisterableTool[]): RegistryDisposer {
    const disposers: RegistryDisposer[] = [];
    try { for (const tool of tools) disposers.push(this.register(tool)); }
    catch (error) { for (const dispose of disposers.reverse()) dispose(); throw error; }
    let disposed = false;
    return () => { if (disposed) return false; disposed = true; let changed = false; for (const dispose of disposers.reverse()) changed = dispose() || changed; return changed; };
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

    const validatedInput = validateToolInput(tool, input);
    const decision = decidePermission(this.policy, { toolName: tool.name, capability: tool.capability });
    if (decision === "deny") {
      throw new Error(`Tool ${tool.name} denied by permission policy`);
    }

    if (decision === "ask") {
      const approved = await this.permissionRequester?.({ tool, input: validatedInput, decision });
      if (!approved) {
        throw new Error(`Tool ${tool.name} requires approval`);
      }
    }

    const normalized = await executeToolManifest(tool, validatedInput, context);
    if (!normalized.ok) {
      throw new Error(normalized.error);
    }
    return normalized.output;
  }
}

export function createBuiltInTools(): ToolDefinition[] {
  return createBuiltInToolManifests().map((manifest) => toLegacyToolDefinition(manifest));
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
    execute: async (input, context) => ({ ok: true, output: await tool.execute(input, context) }),
  });
}

function isToolManifest(tool: RegisterableTool): tool is ToolManifest {
  return typeof (tool as Partial<ToolManifest>).toOpenAITool === "function";
}

async function executeToolManifest(
  tool: ToolManifest,
  input: JsonObject,
  overrides: Partial<ToolExecutionContext>,
): Promise<ToolRunResult> {
  const execution = createExecutionContext(tool, overrides);
  const timeoutMs = Math.max(0, execution.context.timeoutMs);
  const timeoutError = new Error(`Tool ${tool.name} timed out after ${timeoutMs}ms`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: (() => void) | undefined;

  if (execution.context.signal.aborted) {
    execution.cleanup();
    throw abortError(tool, execution.context.signal.reason);
  }

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      execution.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  const abort = new Promise<never>((_, reject) => {
    const onAbort = () => reject(abortError(tool, execution.context.signal.reason));
    execution.context.signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => execution.context.signal.removeEventListener("abort", onAbort);
  });

  try {
    const result = await Promise.race([Promise.resolve(tool.execute(input, execution.context)), timeout, abort]);
    return normalizeToolResult(result);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    removeAbortListener?.();
    execution.cleanup();
  }
}

function toLegacyToolDefinition(tool: ToolManifest): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    capability: tool.capability,
    parameters: tool.parameters,
    namespace: tool.namespace,
    version: tool.version,
    risk: tool.risk,
    timeoutMs: tool.timeoutMs,
    outputLimitBytes: tool.outputLimitBytes,
    concurrency: tool.concurrency,
    evidencePolicy: tool.evidencePolicy,
    resources: tool.resources,
    execute: async (input, context) => {
      const result = await executeToolManifest(tool, input, context ?? {});
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.output;
    },
  };
}

function createExecutionContext(
  tool: ToolManifest,
  overrides: Partial<ToolExecutionContext>,
): { context: ToolExecutionContext; abort: (reason: Error) => void; cleanup: () => void } {
  const controller = new AbortController();
  const callerSignal = overrides.signal;
  let removeCallerAbortListener: (() => void) | undefined;

  if (callerSignal?.aborted) {
    controller.abort(callerSignal.reason);
  } else if (callerSignal) {
    const abortFromCaller = () => controller.abort(callerSignal.reason);
    callerSignal.addEventListener("abort", abortFromCaller, { once: true });
    removeCallerAbortListener = () => callerSignal.removeEventListener("abort", abortFromCaller);
  }

  const context = {
    runId: overrides.runId ?? "local",
    toolCallId: overrides.toolCallId ?? `local_${tool.name}`,
    signal: controller.signal,
    cwd: overrides.cwd ?? process.cwd(),
    timeoutMs: overrides.timeoutMs ?? tool.timeoutMs,
    outputLimitBytes: overrides.outputLimitBytes ?? tool.outputLimitBytes,
  };

  return {
    context,
    abort: (reason) => {
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    },
    cleanup: () => removeCallerAbortListener?.(),
  };
}

function defaultNamespace(capability: string): string {
  return capability.split(".")[0] || "tool";
}

function abortError(tool: ToolManifest, reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  if (typeof reason === "string" && reason.length > 0) {
    return new Error(reason);
  }
  return new Error(`Tool ${tool.name} aborted`);
}
