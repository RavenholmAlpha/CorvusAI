import { Ajv, type ValidateFunction } from "ajv";
import { serializeDurableJson } from "../json.js";
import type { JsonObject, JsonSchema } from "../types.js";
import type { ToolManifest, ToolRunResult } from "./protocol.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new WeakMap<JsonSchema, ValidateFunction>();

export function validateToolInput<TInput extends JsonObject>(
  manifest: Pick<ToolManifest<TInput>, "name" | "parameters">,
  input: JsonObject,
): TInput {
  const validate = validatorFor(manifest.parameters);
  if (!validate(input)) {
    const details = ajv.errorsText(validate.errors, { separator: "; " });
    throw new Error(`Invalid arguments for ${manifest.name}: ${details}`);
  }
  return input as TInput;
}

export function normalizeToolResult(result: ToolRunResult): ToolRunResult {
  let normalized: unknown;
  try {
    normalized = serializeDurableJson(result, "tool result").value;
  } catch (error) {
    throw new Error(`Tool result is not JSON serializable: ${(error as Error).message}`);
  }

  if (!isJsonObjectLike(normalized) || typeof normalized.ok !== "boolean") {
    throw new Error("Invalid tool result: expected an object with ok boolean");
  }

  if (normalized.ok === true) {
    if (!Object.prototype.hasOwnProperty.call(normalized, "output")) {
      throw new Error("Invalid tool result: ok result requires output");
    }
    return normalized as ToolRunResult;
  }

  if (typeof normalized.error !== "string") {
    throw new Error("Invalid tool result: error result requires string error");
  }
  return normalized as ToolRunResult;
}

export function isToolRunResult(value: unknown): value is ToolRunResult {
  if (!isJsonObjectLike(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok === true) {
    return Object.prototype.hasOwnProperty.call(value, "output");
  }
  return typeof value.error === "string";
}

function validatorFor(schema: JsonSchema): ValidateFunction {
  const cached = validators.get(schema);
  if (cached) {
    return cached;
  }

  const validate = ajv.compile(schema);
  validators.set(schema, validate);
  return validate;
}

function isJsonObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
