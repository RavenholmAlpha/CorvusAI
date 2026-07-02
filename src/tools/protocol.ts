import type { JsonObject, JsonSchema, OpenAIToolSchema } from "../types.js";

export type ToolRisk = "low" | "medium" | "high";
export type EvidencePolicy = "none" | "summary" | "full" | "full_if_error";

export interface ToolConcurrency {
  perTool: number;
  perRun: number;
  global: number;
}

export interface ToolExecutionContext {
  runId: string;
  toolCallId: string;
  signal: AbortSignal;
  cwd: string;
  timeoutMs: number;
  outputLimitBytes: number;
}

export type ToolRunResult =
  | { ok: true; output: unknown; summary?: string; metadata?: Record<string, unknown> }
  | { ok: false; error: string; code?: string; metadata?: Record<string, unknown> };

export interface ToolManifest<TInput extends JsonObject = JsonObject> {
  name: string;
  namespace: string;
  version: string;
  description: string;
  capability: string;
  risk: ToolRisk;
  parameters: JsonSchema;
  timeoutMs: number;
  outputLimitBytes: number;
  concurrency: ToolConcurrency;
  evidencePolicy: EvidencePolicy;
  resources: string[];
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolRunResult> | ToolRunResult;
  toOpenAITool: () => OpenAIToolSchema;
}

export function createToolManifest<TInput extends JsonObject>(
  definition: Omit<ToolManifest<TInput>, "toOpenAITool">,
): ToolManifest<TInput> {
  return {
    ...definition,
    toOpenAITool: () => ({
      type: "function",
      function: {
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
      },
    }),
  };
}
