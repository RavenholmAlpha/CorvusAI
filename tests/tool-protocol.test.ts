import { describe, expect, it, vi } from "vitest";
import { createDefaultPolicy } from "../src/permissions.js";
import { createBuiltInToolManifests } from "../src/tools/builtin.js";
import { ToolRegistry } from "../src/tools/index.js";
import { normalizeToolResult, validateToolInput } from "../src/tools/validation.js";

describe("tool protocol", () => {
  it("describes read_file as a durable built-in manifest with an OpenAI schema", () => {
    const tools = createBuiltInToolManifests();
    const readFile = tools.find((tool) => tool.name === "read_file");

    expect(readFile).toMatchObject({
      namespace: "filesystem",
      version: "1.0.0",
      capability: "filesystem.read",
      risk: "low",
      timeoutMs: 10000,
      outputLimitBytes: 12000,
      evidencePolicy: "summary",
    });
    expect(readFile?.toOpenAITool()).toMatchObject({
      type: "function",
      function: {
        name: "read_file",
        description: expect.any(String),
        parameters: {
          type: "object",
          required: ["path"],
        },
      },
    });
  });

  it("validates tool input against a manifest JSON schema", () => {
    const readFile = createBuiltInToolManifests().find((tool) => tool.name === "read_file");
    expect(readFile).toBeDefined();

    expect(() => validateToolInput(readFile!, {})).toThrow(/Invalid arguments for read_file/);
    expect(validateToolInput(readFile!, { path: "package.json" })).toEqual({ path: "package.json" });
  });

  it("normalizes JSON-safe tool results and rejects non-serializable values", () => {
    expect(normalizeToolResult({ ok: true, output: { value: 1, nested: ["x"] } })).toEqual({
      ok: true,
      output: { value: 1, nested: ["x"] },
    });
    expect(normalizeToolResult({ ok: false, error: "bad" })).toEqual({ ok: false, error: "bad" });
    expect(() => normalizeToolResult({ ok: true, output: { bad: () => undefined } })).toThrow(
      /not JSON serializable|Unsupported durable JSON value/,
    );
  });

  it("validates old-style registered tools before execution", async () => {
    const execute = vi.fn(async () => ({ text: "unreachable" }));
    const registry = new ToolRegistry(createDefaultPolicy());
    registry.register({
      name: "echo_required",
      description: "Echo required text",
      capability: "local",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      execute,
    });

    await expect(registry.execute("echo_required", {})).rejects.toThrow(/Invalid arguments for echo_required/);
    expect(execute).not.toHaveBeenCalled();
  });
});
