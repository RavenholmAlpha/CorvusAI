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
export type SubagentTaskStatus = "running" | "succeeded" | "failed" | "canceled";
export type ScopeLeaseStatus = "active" | "released";
export type DecisionScope = "once" | "always" | "never";


export interface AgentRow {
  id: string;
  kind: "master" | "project" | "worker";
  projectId: string | null;
  parentAgentId: string | null;
  roleId: string | null;
  status: "active" | "idle" | "stopped";
  config: JsonObject | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  path: string;
  config: JsonObject | null;
  lastSessionId: string | null;
  mainAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRow {
  id: string;
  projectId: string | null;
  agentId: string | null;
  kind: "master" | "project_main" | "worker";
  parentSessionId: string | null;
  providerId: string | null;
  model: string | null;
  contextWindowTokens: number | null;
  name: string | null;
  preview: string | null;
  messageCount: number;
  totalTokens: number;
  createdAt: string;
  lastActiveAt: string;
  archivedAt: string | null;
}

export interface SubagentTaskRow {
  id: string;
  parentRunId: string | null;
  parentSessionId: string;
  childSessionId: string;
  prompt: string;
  description: string | null;
  modelProfile: string | null;
  agentScope: "project" | "global";
  projectId: string | null;
  parentTaskId: string | null;
  depth: number;
  status: SubagentTaskStatus;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ScopeLeaseRow {
  id: string;
  taskId: string;
  scope: string;
  status: ScopeLeaseStatus;
  createdAt: string;
  heartbeatAt: string;
  expiresAt: string;
  conflictLevel: "none" | "hierarchical";
  releasedAt: string | null;
}

export interface ProjectMemoryRow {
  id: string;
  projectId: string;
  taskId: string | null;
  kind: "architecture" | "decision" | "pitfall" | "convention" | "handoff" | "open_issue";
  title: string;
  content: string;
  confidence: number;
  status: "active" | "obsolete";
  scope: "session" | "project" | "global";
  sourceType: "manual" | "handoff" | "message" | "tool" | "import";
  sourceId: string | null;
  contentHash: string | null;
  verified: boolean;
  sensitivity: "normal" | "sensitive";
  createdAt: string;
  updatedAt: string;
}

export interface RunRow {
  id: string;
  status: RunStatus;
  goal: string;
  model: string;
  endpoint: string;
  sessionId: string | null;
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
  metadata: JsonObject | null;
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
