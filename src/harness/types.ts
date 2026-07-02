import { randomUUID } from "node:crypto";
import type { ChatRole } from "../types.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonArray = JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface SerializedDurableJson<T extends JsonValue = JsonValue> {
  json: string;
  value: T;
}

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

export function serializeDurableJson(value: unknown, label: string): SerializedDurableJson {
  validateDurableJsonValue(value, label, new WeakSet<object>());
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw unsupportedDurableJsonValue(label, "root value is not JSON serializable");
  }
  return {
    json,
    value: JSON.parse(json) as JsonValue,
  };
}

export function serializeDurableJsonObject(value: Record<string, unknown>, label: string): SerializedDurableJson<JsonObject> {
  const serialized = serializeDurableJson(value, label);
  if (!isJsonObject(serialized.value)) {
    throw unsupportedDurableJsonValue(label, "expected a JSON object");
  }
  return serialized as SerializedDurableJson<JsonObject>;
}

function validateDurableJsonValue(value: unknown, path: string, seen: WeakSet<object>): void {
  if (value === null) {
    return;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return;
    case "number":
      if (!Number.isFinite(value)) {
        throw unsupportedDurableJsonValue(path, `${String(value)} is not a finite JSON number`);
      }
      return;
    case "undefined":
      throw unsupportedDurableJsonValue(path, "undefined is not valid JSON");
    case "function":
      throw unsupportedDurableJsonValue(path, "functions are not valid JSON");
    case "bigint":
      throw unsupportedDurableJsonValue(path, "bigints are not valid JSON");
    case "symbol":
      throw unsupportedDurableJsonValue(path, "symbols are not valid JSON");
    case "object":
      validateDurableJsonObjectLike(value, path, seen);
      return;
  }
}

function validateDurableJsonObjectLike(value: object, path: string, seen: WeakSet<object>): void {
  if (seen.has(value)) {
    throw unsupportedDurableJsonValue(path, "circular references are not valid JSON");
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      validateDurableJsonArray(value, path, seen);
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw unsupportedDurableJsonValue(path, "non-plain objects are not valid JSON");
    }

    rejectSymbolKeys(value, path);
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      validateDurableJsonValue(item, childPath(path, key), seen);
    }
  } finally {
    seen.delete(value);
  }
}

function validateDurableJsonArray(value: unknown[], path: string, seen: WeakSet<object>): void {
  rejectSymbolKeys(value, path);
  for (const key of Object.keys(value)) {
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      throw unsupportedDurableJsonValue(childPath(path, key), "array object properties are not valid JSON");
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw unsupportedDurableJsonValue(`${path}[${index}]`, "array holes are not valid JSON");
    }
    validateDurableJsonValue(value[index], `${path}[${index}]`, seen);
  }
}

function rejectSymbolKeys(value: object, path: string): void {
  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length > 0) {
    throw unsupportedDurableJsonValue(`${path}[${String(symbols[0])}]`, "symbol-keyed properties are not valid JSON");
  }
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function childPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function unsupportedDurableJsonValue(path: string, reason: string): Error {
  return new Error(`Unsupported durable JSON value at ${path}: ${reason}`);
}
