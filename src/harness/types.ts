import { randomUUID } from "node:crypto";
import type { JsonObject, JsonValue } from "../json.js";
import type { ChatRole } from "../types.js";

export {
  serializeDurableJson,
  serializeDurableJsonObject,
  type JsonArray,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
  type SerializedDurableJson,
} from "../json.js";

export type RunStatus =
  | "created"
  | "running"
  | "waiting_for_approval"
  | "succeeded"
  | "failed"
  | "canceled"
  | "interrupted";

export type StepKind = "model" | "tool" | "approval" | "review" | "system";
export type StepStatus = "created" | "running" | "succeeded" | "failed" | "canceled" | "interrupted";
export type EvidenceSourceType = "tool_result" | "tool_error" | "permission_denial" | "model_error" | "system";
export type ToolCallStatus =
  | "pending"
  | "approval_required"
  | "running"
  | "succeeded"
  | "failed"
  | "denied"
  | "canceled"
  | "interrupted";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type DecisionScope = "once" | "always" | "never";

export interface RunRow {
  id: string;
  status: RunStatus;
  goal: string;
  model: string;
  endpoint: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface StepRow {
  id: string;
  runId: string;
  index: number;
  kind: StepKind;
  status: StepStatus;
  title: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MessageRow {
  id: string;
  runId: string;
  role: ChatRole;
  content: string | null;
  toolCallId: string | null;
  createdAt: string;
}

export interface EventRow {
  id: string;
  runId: string | null;
  type: string;
  payload: JsonObject;
  createdAt: string;
}

export interface EvidenceRow {
  id: string;
  runId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  title: string;
  summary: string;
  content: string;
  createdAt: string;
}

export interface ToolCallRow {
  id: string;
  runId: string;
  stepId: string | null;
  toolName: string;
  capability: string;
  status: ToolCallStatus;
  arguments: JsonObject;
  result: JsonValue | null;
  error: string | null;
  timeoutMs: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ApprovalRow {
  id: string;
  runId: string;
  toolCallId: string;
  toolName: string | null;
  status: ApprovalStatus;
  decisionScope: DecisionScope;
  createdAt: string;
  decidedAt: string | null;
}

export interface SnapshotRow {
  id: string;
  runId: string;
  snapshot: JsonValue;
  createdAt: string;
}

let lastTimestampMs = 0;

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function nowIso(): string {
  const currentTimestampMs = Date.now();
  const nextTimestampMs = currentTimestampMs <= lastTimestampMs ? lastTimestampMs + 1 : currentTimestampMs;
  lastTimestampMs = nextTimestampMs;
  return new Date(nextTimestampMs).toISOString();
}
