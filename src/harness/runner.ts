import type { CorvusConfig } from "../config.js";
import type { ChatCompletionRequest } from "../openai-client.js";
import type { JsonObject } from "../types.js";
import type { ChatCompletionResponse, ChatMessage, ToolCall } from "../types.js";
import type { EventLog } from "./event-log.js";
import type { EvidenceStore } from "./evidence-store.js";
import type { RunStore } from "./run-store.js";
import type { ToolQueue, ToolQueueResult } from "./tool-queue.js";
import type { JsonObject as DurableJsonObject, StepStatus } from "./types.js";
import type { ToolManifest } from "../tools/protocol.js";
import type { ToolRegistry } from "../tools/index.js";

export interface HarnessModel {
  createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

export interface HarnessRunnerOptions {
  config: CorvusConfig;
  model: HarnessModel;
  tools: ToolRegistry;
  runs: RunStore;
  queue: ToolQueue;
  evidence: EvidenceStore;
  events: EventLog;
}

export interface RunTurnOptions {
  history?: ChatMessage[];
}

interface DurableToolResult {
  message: ChatMessage;
  status: ToolQueueResult["status"] | "failed";
}

export class HarnessRunner {
  constructor(private readonly options: HarnessRunnerOptions) {}

  async runTurn(content: string, options: RunTurnOptions = {}): Promise<{ runId: string; message: ChatMessage }> {
    const run = this.options.runs.createRun({
      goal: this.options.config.goal || content,
      model: this.options.config.model,
      endpoint: this.options.config.endpoint,
    });
    let lastModelStepId = "model";
    let runningModelStepId: string | null = null;

    try {
      this.options.runs.updateRunStatus(run.id, "running");
      const messages: ChatMessage[] = [
        this.systemMessage(),
        ...priorConversation(options.history ?? []),
        { role: "user", content },
      ];
      this.options.runs.appendMessage({ runId: run.id, role: "user", content });
      this.writeSnapshot(run.id, "user_message", 0, messages);

      for (let round = 0; round <= this.options.config.maxToolRounds; round += 1) {
        messages[0] = this.systemMessage();
        const modelStep = this.options.runs.createStep({
          runId: run.id,
          kind: "model",
          status: "running",
          title: `Model round ${round + 1}`,
        });
        lastModelStepId = modelStep.id;
        runningModelStepId = modelStep.id;
        const response = await this.options.model.createChatCompletion({
          messages: messages.map((message) => cloneChatMessage(message)),
          tools: this.options.tools.toOpenAITools(),
          tool_choice: "auto",
        });
        const message = response.choices[0]?.message;
        if (!message) {
          throw new Error("Model returned no choices");
        }

        messages.push(message);
        this.options.runs.appendMessage({
          runId: run.id,
          role: "assistant",
          content: message.content ?? null,
          metadata: messageMetadata(message),
        });
        this.options.runs.updateStepStatus(modelStep.id, "succeeded");
        runningModelStepId = null;
        this.writeSnapshot(run.id, "model_message", round, messages);

        const toolCalls = message.tool_calls ?? [];
        if (toolCalls.length === 0) {
          this.options.runs.updateRunStatus(run.id, "succeeded");
          this.writeSnapshot(run.id, "succeeded", round, messages);
          return { runId: run.id, message };
        }
        if (round >= this.options.config.maxToolRounds) {
          throw new Error(`Tool loop exceeded maxToolRounds=${this.options.config.maxToolRounds}`);
        }

        let waitingForApproval = false;
        for (const call of toolCalls) {
          const toolResult = await this.runToolCall(run.id, call);
          const toolMessage = toolResult.message;
          messages.push(toolMessage);
          this.options.runs.appendMessage({
            runId: run.id,
            role: "tool",
            content: toolMessage.content ?? null,
            toolCallId: toolMessage.tool_call_id,
            metadata: messageMetadata(toolMessage),
          });
          this.writeSnapshot(run.id, "tool_result", round, messages);
          if (toolResult.status === "approval_required") {
            waitingForApproval = true;
          }
        }

        if (waitingForApproval) {
          this.options.runs.updateRunStatus(run.id, "waiting_for_approval");
          this.writeSnapshot(run.id, "waiting_for_approval", round, messages);
          return { runId: run.id, message };
        }
      }

      throw new Error(`Tool loop exceeded maxToolRounds=${this.options.config.maxToolRounds}`);
    } catch (error) {
      const message = (error as Error).message;
      if (runningModelStepId) {
        this.updateStepStatus(runningModelStepId, "failed");
      }
      this.options.events.append("model.error", { runId: run.id, error: message }, run.id);
      this.options.evidence.createEvidence({
        runId: run.id,
        sourceType: "model_error",
        sourceId: lastModelStepId,
        title: "Model error",
        summary: message,
        content: (error as Error).stack ?? message,
      });
      this.options.runs.updateRunStatus(run.id, "failed");
      this.options.runs.writeSnapshot(run.id, {
        phase: "failed",
        error: message,
      });
      throw error;
    }
  }

  private async runToolCall(runId: string, call: ToolCall): Promise<DurableToolResult> {
    const step = this.options.runs.createStep({
      runId,
      kind: "tool",
      status: "running",
      title: `Tool ${call.function.name}`,
    });
    try {
      const tool = this.findTool(call.function.name);
      const result = await this.options.queue.enqueueAndRun({
        runId,
        stepId: step.id,
        tool,
        args: parseToolArguments(call),
      });
      this.options.runs.updateStepStatus(step.id, stepStatusForToolResult(result.status));
      return {
        message: toolResultMessage(call, result),
        status: result.status,
      };
    } catch (error) {
      this.options.runs.updateStepStatus(step.id, "failed");
      return {
        message: toolErrorMessage(call, (error as Error).message),
        status: "failed",
      };
    }
  }

  private findTool(name: string): ToolManifest {
    const tool = this.options.tools.list().find((candidate) => candidate.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool;
  }

  private systemMessage(): ChatMessage {
    return { role: "system", content: this.buildSystemPrompt() };
  }

  private buildSystemPrompt(): string {
    const lines = [this.options.config.systemPrompt];
    if (this.options.config.goal) {
      lines.push(`Active goal: ${this.options.config.goal}`);
    }
    if (this.options.config.review.enabled) {
      lines.push(`Review mode instruction: ${this.options.config.review.instruction}`);
    }
    return lines.join("\n\n");
  }

  private writeSnapshot(runId: string, phase: string, round: number, messages: ChatMessage[]): void {
    this.options.runs.writeSnapshot(runId, {
      phase,
      round,
      messages: messages.map((message) => snapshotMessage(message)),
    });
  }

  private updateStepStatus(stepId: string, status: StepStatus): void {
    this.options.runs.updateStepStatus(stepId, status);
  }
}

function parseToolArguments(call: ToolCall): JsonObject {
  if (!call.function.arguments) {
    return {};
  }
  const parsed = JSON.parse(call.function.arguments) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Tool ${call.function.name} arguments must be a JSON object`);
  }
  return parsed as JsonObject;
}

function toolResultMessage(call: ToolCall, result: ToolQueueResult): ChatMessage {
  return {
    role: "tool",
    tool_call_id: call.id,
    name: call.function.name,
    content: JSON.stringify(toolResultContent(result)),
  };
}

function toolErrorMessage(call: ToolCall, error: string): ChatMessage {
  return {
    role: "tool",
    tool_call_id: call.id,
    name: call.function.name,
    content: JSON.stringify({
      status: "failed",
      toolCallId: call.id,
      error,
    }),
  };
}

function toolResultContent(result: ToolQueueResult): Record<string, unknown> {
  if (result.status === "succeeded") {
    return {
      status: result.status,
      toolCallId: result.toolCallId,
      output: result.output,
      result: result.result,
      ...(result.evidenceId ? { evidenceId: result.evidenceId } : {}),
    };
  }
  if (result.status === "approval_required") {
    return {
      status: result.status,
      toolCallId: result.toolCallId,
      approvalId: result.approvalId,
    };
  }
  return {
    status: result.status,
    toolCallId: result.toolCallId,
    error: result.error,
    ...(result.evidenceId ? { evidenceId: result.evidenceId } : {}),
    ...(result.status === "failed" && result.result ? { result: result.result } : {}),
  };
}

function stepStatusForToolResult(status: ToolQueueResult["status"]): StepStatus {
  if (status === "succeeded") {
    return "succeeded";
  }
  if (status === "approval_required") {
    return "interrupted";
  }
  return "failed";
}

function snapshotMessage(message: ChatMessage): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { role: message.role };
  if (message.content !== undefined) {
    snapshot.content = message.content;
  }
  if (message.name) {
    snapshot.name = message.name;
  }
  if (message.tool_call_id) {
    snapshot.tool_call_id = message.tool_call_id;
  }
  if (message.tool_calls) {
    snapshot.tool_calls = message.tool_calls;
  }
  return snapshot;
}

function messageMetadata(message: ChatMessage): DurableJsonObject | undefined {
  const metadata: Record<string, unknown> = {};
  if (message.name) {
    metadata.name = message.name;
  }
  if (message.tool_call_id) {
    metadata.tool_call_id = message.tool_call_id;
  }
  if (message.tool_calls) {
    metadata.tool_calls = message.tool_calls;
  }
  return Object.keys(metadata).length > 0 ? (metadata as DurableJsonObject) : undefined;
}

function priorConversation(history: ChatMessage[]): ChatMessage[] {
  return history
    .filter((message) => message.role !== "system")
    .map((message) => cloneChatMessage(message));
}

function cloneChatMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    ...(message.tool_calls
      ? {
          tool_calls: message.tool_calls.map((call) => ({
            ...call,
            function: { ...call.function },
          })),
        }
      : {}),
  };
}
