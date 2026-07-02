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
  const normalized = normalizeDurableJsonValue(value, label, new WeakSet<object>());
  const json = JSON.stringify(normalized);
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

function normalizeDurableJsonValue(value: unknown, path: string, seen: WeakSet<object>): JsonValue {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw unsupportedDurableJsonValue(path, `${String(value)} is not a finite JSON number`);
      }
      return value;
    case "undefined":
      throw unsupportedDurableJsonValue(path, "undefined is not valid JSON");
    case "function":
      throw unsupportedDurableJsonValue(path, "functions are not valid JSON");
    case "bigint":
      throw unsupportedDurableJsonValue(path, "bigints are not valid JSON");
    case "symbol":
      throw unsupportedDurableJsonValue(path, "symbols are not valid JSON");
    case "object":
      return normalizeDurableJsonObjectLike(value, path, seen);
  }

  throw unsupportedDurableJsonValue(path, `unsupported type ${typeof value}`);
}

function normalizeDurableJsonObjectLike(value: object, path: string, seen: WeakSet<object>): JsonArray | JsonObject {
  if (seen.has(value)) {
    throw unsupportedDurableJsonValue(path, "circular references are not valid JSON");
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return normalizeDurableJsonArray(value, path, seen);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw unsupportedDurableJsonValue(path, "non-plain objects are not valid JSON");
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    rejectUnsafeOwnProperties(value, descriptors, path);

    const normalized: JsonObject = {};
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable) {
        continue;
      }
      normalized[key] = normalizeDurableJsonValue(descriptor.value, childPath(path, key), seen);
    }
    return normalized;
  } finally {
    seen.delete(value);
  }
}

function normalizeDurableJsonArray(value: unknown[], path: string, seen: WeakSet<object>): JsonArray {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  rejectUnsafeOwnProperties(value, descriptors, path);

  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === "length" || isArrayIndex(key, value.length)) {
      continue;
    }
    if ("get" in descriptor || "set" in descriptor) {
      throw unsupportedDurableJsonValue(childPath(path, key), "accessor properties are not valid JSON");
    }
    if (descriptor.enumerable) {
      throw unsupportedDurableJsonValue(childPath(path, key), "array object properties are not valid JSON");
    }
  }

  const normalized: JsonArray = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor) {
      throw unsupportedDurableJsonValue(`${path}[${index}]`, "array holes are not valid JSON");
    }
    if ("get" in descriptor || "set" in descriptor) {
      throw unsupportedDurableJsonValue(`${path}[${index}]`, "accessor properties are not valid JSON");
    }
    normalized[index] = normalizeDurableJsonValue(descriptor.value, `${path}[${index}]`, seen);
  }
  return normalized;
}

function rejectUnsafeOwnProperties(value: object, descriptors: Record<string, PropertyDescriptor>, path: string): void {
  rejectSymbolKeys(value, path);
  if (Object.prototype.hasOwnProperty.call(descriptors, "toJSON")) {
    throw unsupportedDurableJsonValue(childPath(path, "toJSON"), "own toJSON is not supported");
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if ("get" in descriptor || "set" in descriptor) {
      throw unsupportedDurableJsonValue(childPath(path, key), "accessor properties are not valid JSON");
    }
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

function isArrayIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

function unsupportedDurableJsonValue(path: string, reason: string): Error {
  return new Error(`Unsupported durable JSON value at ${path}: ${reason}`);
}
