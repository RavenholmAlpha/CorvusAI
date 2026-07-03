import type { CorvusDatabase } from "../db/connection.js";
import type { JsonObject as DurableJsonObject, JsonValue } from "../json.js";
import type { JsonObject as ToolInputObject } from "../types.js";
import type { ToolExecutionContext, ToolManifest, ToolRunResult } from "../tools/protocol.js";
import { normalizeToolResult, validateToolInput } from "../tools/validation.js";
import type { ApprovalService } from "./approval-service.js";
import type { EventLog } from "./event-log.js";
import type { EvidenceStore } from "./evidence-store.js";
import {
  newId,
  nowIso,
  serializeDurableJson,
  serializeDurableJsonObject,
  type EvidenceSourceType,
  type ToolCallRow,
  type ToolCallStatus,
} from "./types.js";

export interface EnqueueToolCallInput {
  runId: string;
  stepId?: string | null;
  tool: ToolManifest;
  args: ToolInputObject;
}

export type ToolQueueResult =
  | {
      toolCallId: string;
      status: "succeeded";
      result: ToolRunResult;
      output: unknown;
      evidenceId?: string;
    }
  | {
      toolCallId: string;
      status: "approval_required";
      approvalId: string;
    }
  | {
      toolCallId: string;
      status: "denied";
      error: string;
      evidenceId: string;
    }
  | {
      toolCallId: string;
      status: "failed";
      error: string;
      result?: ToolRunResult;
      evidenceId?: string;
    };

interface ToolCallDbRow {
  id: string;
  run_id: string;
  step_id: string | null;
  tool_name: string;
  capability: string;
  status: ToolCallStatus;
  arguments_json: string;
  result_json: string | null;
  error: string | null;
  timeout_ms: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ApprovedApprovalRow {
  id: string;
  status: string;
}

interface EvidenceIdRow {
  id: string;
}

export class ToolQueue {
  constructor(
    private readonly db: CorvusDatabase,
    private readonly events: EventLog,
    private readonly evidence: EvidenceStore,
    private readonly approvals: ApprovalService,
  ) {}

  async enqueueAndRun(input: EnqueueToolCallInput): Promise<ToolQueueResult> {
    const toolCall = this.createToolCall(input);

    let args: ToolInputObject;
    try {
      args = validateToolInput(input.tool, input.args);
    } catch (error) {
      return this.failToolCall(toolCall, (error as Error).message, undefined, input.tool.evidencePolicy);
    }

    const decision = this.approvals.decideToolPermission(input.tool.name, input.tool.capability);
    if (decision === "ask") {
      const approval = this.approvals.createApproval({
        runId: toolCall.runId,
        toolCallId: toolCall.id,
        toolName: input.tool.name,
      });
      this.markApprovalRequired(toolCall, approval.id);
      return { toolCallId: toolCall.id, status: "approval_required", approvalId: approval.id };
    }

    if (decision === "deny") {
      return this.denyToolCall(toolCall, `Tool ${input.tool.name} denied by permission policy`);
    }

    return this.executeToolCall(toolCall, input.tool, args, "pending");
  }

  async runApproved(toolCallId: string, tool: ToolManifest): Promise<ToolQueueResult> {
    const toolCall = this.getToolCall(toolCallId);
    if (!toolCall) {
      throw new Error(`Tool call not found: ${toolCallId}`);
    }
    this.assertToolMatches(toolCall, tool);

    const replayed = this.replayTerminalToolCall(toolCall, tool);
    if (replayed) {
      return replayed;
    }
    if (toolCall.status !== "approval_required") {
      throw new Error(`Tool call ${toolCallId} is not waiting for approval`);
    }

    const approval = this.db
      .prepare("select id, status from approvals where tool_call_id = ? and status = 'approved' order by decided_at desc, id desc limit 1")
      .get(toolCallId) as ApprovedApprovalRow | undefined;
    if (!approval) {
      throw new Error(`Tool call ${toolCallId} does not have an approved approval`);
    }

    const args = validateToolInput(tool, toolCall.arguments);
    return this.executeToolCall(toolCall, tool, args, "approval_required");
  }

  recoverInterrupted(): ToolCallRow[] {
    const running = this.db
      .prepare(
        `select id, run_id, step_id, tool_name, capability, status, arguments_json, result_json, error,
                timeout_ms, created_at, started_at, completed_at
         from tool_calls
         where status = 'running'
         order by created_at, id`,
      )
      .all()
      .map((row) => mapToolCallRow(row as ToolCallDbRow));

    return this.db.transaction(() => {
      const recovered: ToolCallRow[] = [];
      for (const toolCall of running) {
        const completedAt = nowIso();
        const update = this.db
          .prepare("update tool_calls set status = ?, error = ?, completed_at = ? where id = ? and status = 'running'")
          .run("interrupted", "Tool call interrupted during recovery", completedAt, toolCall.id);
        if (update.changes === 0) {
          continue;
        }
        const updated = this.getToolCall(toolCall.id);
        if (!updated) {
          throw new Error(`Tool call not found after recovery: ${toolCall.id}`);
        }
        this.events.append(
          "tool_call.interrupted",
          {
            runId: updated.runId,
            toolCallId: updated.id,
            toolName: updated.toolName,
            error: updated.error,
          },
          updated.runId,
        );
        this.events.append(
          "recovery.interrupted_tool_call",
          {
            runId: updated.runId,
            toolCallId: updated.id,
            toolName: updated.toolName,
          },
          updated.runId,
        );
        recovered.push(updated);
      }
      return recovered;
    })();
  }

  getToolCall(id: string): ToolCallRow | undefined {
    const row = this.db
      .prepare(
        `select id, run_id, step_id, tool_name, capability, status, arguments_json, result_json, error,
                timeout_ms, created_at, started_at, completed_at
         from tool_calls
         where id = ?`,
      )
      .get(id);
    return row ? mapToolCallRow(row as ToolCallDbRow) : undefined;
  }

  private createToolCall(input: EnqueueToolCallInput): ToolCallRow {
    return this.db.transaction(() => {
      const args = serializeDurableJsonObject(input.args, "tool arguments");
      const toolCall: ToolCallRow = {
        id: newId("tool"),
        runId: input.runId,
        stepId: input.stepId ?? null,
        toolName: input.tool.name,
        capability: input.tool.capability,
        status: "pending",
        arguments: args.value,
        result: null,
        error: null,
        timeoutMs: input.tool.timeoutMs,
        createdAt: nowIso(),
        startedAt: null,
        completedAt: null,
      };

      this.db
        .prepare(
          `insert into tool_calls
            (id, run_id, step_id, tool_name, capability, status, arguments_json, result_json, error, timeout_ms, created_at, started_at, completed_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          toolCall.id,
          toolCall.runId,
          toolCall.stepId,
          toolCall.toolName,
          toolCall.capability,
          toolCall.status,
          args.json,
          null,
          null,
          toolCall.timeoutMs,
          toolCall.createdAt,
          null,
          null,
        );
      this.events.append(
        "tool_call.created",
        {
          runId: toolCall.runId,
          toolCallId: toolCall.id,
          stepId: toolCall.stepId,
          toolName: toolCall.toolName,
          capability: toolCall.capability,
          status: toolCall.status,
        },
        toolCall.runId,
      );
      this.events.append(
        "tool_call.queued",
        {
          runId: toolCall.runId,
          toolCallId: toolCall.id,
          toolName: toolCall.toolName,
        },
        toolCall.runId,
      );
      return toolCall;
    })();
  }

  private markApprovalRequired(toolCall: ToolCallRow, approvalId: string): void {
    this.db.transaction(() => {
      this.db
        .prepare("update tool_calls set status = ?, error = null where id = ?")
        .run("approval_required", toolCall.id);
      this.events.append(
        "tool_call.approval_required",
        {
          runId: toolCall.runId,
          toolCallId: toolCall.id,
          toolName: toolCall.toolName,
          approvalId,
        },
        toolCall.runId,
      );
    })();
  }

  private async executeToolCall(
    toolCall: ToolCallRow,
    tool: ToolManifest,
    args: ToolInputObject,
    expectedStatus: ToolCallStatus,
  ): Promise<ToolQueueResult> {
    const runningToolCall = this.markRunning(toolCall, expectedStatus);
    if (!runningToolCall) {
      const current = this.getToolCall(toolCall.id);
      if (!current) {
        throw new Error(`Tool call not found after claim failed: ${toolCall.id}`);
      }
      this.assertToolMatches(current, tool);
      const replayed = this.replayTerminalToolCall(current, tool);
      if (replayed) {
        return replayed;
      }
      throw new Error(
        `Tool call ${toolCall.id} could not be claimed from ${expectedStatus}; current status is ${current.status}`,
      );
    }
    try {
      const result = limitToolOutput(await this.executeWithTimeout(runningToolCall, tool, args), tool.outputLimitBytes);
      if (!result.ok) {
        return this.failToolCall(runningToolCall, result.error, result, tool.evidencePolicy);
      }

      const resultJson = serializeDurableJsonObject(result as unknown as Record<string, unknown>, "tool result");
      const completedAt = nowIso();
      this.db.transaction(() => {
        this.db
          .prepare("update tool_calls set status = ?, result_json = ?, error = null, completed_at = ? where id = ?")
          .run("succeeded", resultJson.json, completedAt, runningToolCall.id);
        this.events.append(
          "tool_call.succeeded",
          {
            runId: runningToolCall.runId,
            toolCallId: runningToolCall.id,
            toolName: runningToolCall.toolName,
          },
          runningToolCall.runId,
        );
      })();
      const evidenceId = this.createResultEvidence(runningToolCall, tool, result);
      return {
        toolCallId: runningToolCall.id,
        status: "succeeded",
        result,
        output: result.output,
        ...(evidenceId ? { evidenceId } : {}),
      };
    } catch (error) {
      return this.failToolCall(runningToolCall, (error as Error).message, undefined, tool.evidencePolicy);
    }
  }

  private markRunning(toolCall: ToolCallRow, expectedStatus: ToolCallStatus): ToolCallRow | undefined {
    return this.db.transaction(() => {
      const startedAt = nowIso();
      const update = this.db
        .prepare(
          "update tool_calls set status = ?, started_at = ?, completed_at = null, error = null where id = ? and status = ?",
        )
        .run("running", startedAt, toolCall.id, expectedStatus);
      if (update.changes === 0) {
        return undefined;
      }
      this.events.append(
        "tool_call.running",
        {
          runId: toolCall.runId,
          toolCallId: toolCall.id,
          toolName: toolCall.toolName,
        },
        toolCall.runId,
      );
      const updated = this.getToolCall(toolCall.id);
      if (!updated) {
        throw new Error(`Tool call not found after claim: ${toolCall.id}`);
      }
      return updated;
    })();
  }

  private async executeWithTimeout(
    toolCall: ToolCallRow,
    tool: ToolManifest,
    args: ToolInputObject,
  ): Promise<ToolRunResult> {
    const controller = new AbortController();
    const timeoutMs = Math.max(0, toolCall.timeoutMs);
    const timeoutError = new Error(`Tool ${tool.name} timed out after ${timeoutMs}ms`);
    const context: ToolExecutionContext = {
      runId: toolCall.runId,
      toolCallId: toolCall.id,
      signal: controller.signal,
      cwd: process.cwd(),
      timeoutMs,
      outputLimitBytes: tool.outputLimitBytes,
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        if (!controller.signal.aborted) {
          controller.abort(timeoutError);
        }
        reject(timeoutError);
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([Promise.resolve().then(() => tool.execute(args, context)), timeout]);
      return normalizeToolResult(result);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private failToolCall(
    toolCall: ToolCallRow,
    message: string,
    result?: ToolRunResult,
    evidencePolicy: ToolManifest["evidencePolicy"] = "summary",
  ): ToolQueueResult {
    const resultJson = result
      ? serializeDurableJsonObject(result as unknown as Record<string, unknown>, "tool result").json
      : null;
    const completedAt = nowIso();
    this.db.transaction(() => {
      this.db
        .prepare("update tool_calls set status = ?, result_json = ?, error = ?, completed_at = ? where id = ?")
        .run("failed", resultJson, message, completedAt, toolCall.id);
      this.events.append(
        "tool_call.failed",
        {
          runId: toolCall.runId,
          toolCallId: toolCall.id,
          toolName: toolCall.toolName,
          error: message,
        },
        toolCall.runId,
      );
    })();
    const evidenceId = this.createErrorEvidence(toolCall, message, result, evidencePolicy);
    return {
      toolCallId: toolCall.id,
      status: "failed",
      error: message,
      ...(result ? { result } : {}),
      ...(evidenceId ? { evidenceId } : {}),
    };
  }

  private denyToolCall(toolCall: ToolCallRow, message: string): ToolQueueResult {
    const completedAt = nowIso();
    this.db.transaction(() => {
      this.db
        .prepare("update tool_calls set status = ?, error = ?, completed_at = ? where id = ?")
        .run("denied", message, completedAt, toolCall.id);
      this.events.append(
        "tool_call.denied",
        {
          runId: toolCall.runId,
          toolCallId: toolCall.id,
          toolName: toolCall.toolName,
          error: message,
        },
        toolCall.runId,
      );
    })();
    const evidence = this.evidence.createEvidence({
      runId: toolCall.runId,
      sourceType: "permission_denial",
      sourceId: toolCall.id,
      title: `Tool ${toolCall.toolName} denied`,
      summary: message,
      content: message,
    });
    return { toolCallId: toolCall.id, status: "denied", error: message, evidenceId: evidence.id };
  }

  private createResultEvidence(toolCall: ToolCallRow, tool: ToolManifest, result: ToolRunResult): string | undefined {
    if (tool.evidencePolicy === "none") {
      return undefined;
    }
    const summary = result.ok ? result.summary ?? summarizeValue(result.output) : result.error;
    const evidence = this.evidence.createEvidence({
      runId: toolCall.runId,
      sourceType: result.ok ? "tool_result" : "tool_error",
      sourceId: toolCall.id,
      title: `Tool ${toolCall.toolName} ${result.ok ? "result" : "error"}`,
      summary,
      content: evidenceContent(tool.evidencePolicy, result, summary),
    });
    return evidence.id;
  }

  private createErrorEvidence(
    toolCall: ToolCallRow,
    message: string,
    result?: ToolRunResult,
    evidencePolicy: ToolManifest["evidencePolicy"] = "summary",
  ): string {
    const evidence = this.evidence.createEvidence({
      runId: toolCall.runId,
      sourceType: "tool_error",
      sourceId: toolCall.id,
      title: `Tool ${toolCall.toolName} error`,
      summary: message,
      content: result ? evidenceContent(evidencePolicy, result, message) : message,
    });
    return evidence.id;
  }

  private assertToolMatches(toolCall: ToolCallRow, tool: ToolManifest): void {
    if (toolCall.toolName !== tool.name) {
      throw new Error(`Tool call ${toolCall.id} is for ${toolCall.toolName}, not ${tool.name}`);
    }
    if (toolCall.capability !== tool.capability) {
      throw new Error(`Tool call ${toolCall.id} requires capability ${toolCall.capability}, not ${tool.capability}`);
    }
  }

  private replayTerminalToolCall(toolCall: ToolCallRow, tool: ToolManifest): ToolQueueResult | undefined {
    if (toolCall.status === "succeeded") {
      if (!toolCall.result) {
        throw new Error(`Tool call ${toolCall.id} succeeded without a stored result`);
      }
      const result = normalizeToolResult(toolCall.result as ToolRunResult);
      if (!result.ok) {
        throw new Error(`Tool call ${toolCall.id} stored a non-success result for succeeded status`);
      }
      const evidenceId = this.findLatestEvidenceId(toolCall.id, ["tool_result"]);
      return {
        toolCallId: toolCall.id,
        status: "succeeded",
        result,
        output: result.output,
        ...(evidenceId ? { evidenceId } : {}),
      };
    }

    if (toolCall.status === "failed") {
      const result = toolCall.result ? normalizeToolResult(toolCall.result as ToolRunResult) : undefined;
      const evidenceId = this.findLatestEvidenceId(toolCall.id, ["tool_error"]);
      return {
        toolCallId: toolCall.id,
        status: "failed",
        error: toolCall.error ?? `Tool ${tool.name} failed`,
        ...(result ? { result } : {}),
        ...(evidenceId ? { evidenceId } : {}),
      };
    }

    if (toolCall.status === "denied") {
      const evidenceId = this.findLatestEvidenceId(toolCall.id, ["permission_denial"]);
      if (!evidenceId) {
        throw new Error(`Tool call ${toolCall.id} was denied without denial evidence`);
      }
      return {
        toolCallId: toolCall.id,
        status: "denied",
        error: toolCall.error ?? `Tool ${tool.name} denied`,
        evidenceId,
      };
    }

    return undefined;
  }

  private findLatestEvidenceId(toolCallId: string, sourceTypes: EvidenceSourceType[]): string | undefined {
    const placeholders = sourceTypes.map(() => "?").join(", ");
    const row = this.db
      .prepare(
        `select id
         from evidence
         where source_id = ? and source_type in (${placeholders})
         order by created_at desc, id desc
         limit 1`,
      )
      .get(toolCallId, ...sourceTypes) as EvidenceIdRow | undefined;
    return row?.id;
  }
}

function mapToolCallRow(row: ToolCallDbRow): ToolCallRow {
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    toolName: row.tool_name,
    capability: row.capability,
    status: row.status,
    arguments: JSON.parse(row.arguments_json) as DurableJsonObject,
    result: row.result_json ? (JSON.parse(row.result_json) as JsonValue) : null,
    error: row.error,
    timeoutMs: row.timeout_ms,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function limitToolOutput(result: ToolRunResult, outputLimitBytes: number): ToolRunResult {
  if (!result.ok) {
    return result;
  }

  const output = serializeDurableJson(result.output, "tool output");
  const outputBytes = Buffer.byteLength(output.json, "utf8");
  if (outputBytes <= outputLimitBytes) {
    return result;
  }

  const limited: ToolRunResult = {
    ...result,
    output: {
      truncated: true,
      originalBytes: outputBytes,
      outputLimitBytes,
      preview: truncateUtf8(output.json, outputLimitBytes),
    },
    metadata: {
      ...result.metadata,
      outputTruncated: true,
      originalBytes: outputBytes,
      outputLimitBytes,
    },
  };
  return normalizeToolResult(limited);
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }
  let preview = "";
  let bytes = 0;
  for (const codePoint of value) {
    const codePointBytes = Buffer.byteLength(codePoint, "utf8");
    if (bytes + codePointBytes > maxBytes) {
      break;
    }
    preview += codePoint;
    bytes += codePointBytes;
  }
  return preview;
}

function summarizeValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function evidenceContent(policy: ToolManifest["evidencePolicy"], result: ToolRunResult, summary: string): string {
  if (policy === "full" || (policy === "full_if_error" && !result.ok)) {
    return JSON.stringify(result);
  }
  return summary;
}
