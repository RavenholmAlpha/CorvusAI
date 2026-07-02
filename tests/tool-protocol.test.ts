import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultPolicy } from "../src/permissions.js";
import { createBuiltInToolManifests } from "../src/tools/builtin.js";
import { createToolManifest } from "../src/tools/protocol.js";
import { createBuiltInTools, ToolRegistry } from "../src/tools/index.js";
import { normalizeToolResult, validateToolInput } from "../src/tools/validation.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

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

  it("validates ask-permission tools before requesting permission", async () => {
    const execute = vi.fn(async () => ({ text: "unreachable" }));
    const requestPermission = vi.fn(async () => true);
    const registry = new ToolRegistry(createDefaultPolicy(), { onPermissionRequest: requestPermission });
    registry.register({
      name: "write_required",
      description: "Write required text",
      capability: "filesystem.write",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      execute,
    });

    await expect(registry.execute("write_required", {})).rejects.toThrow(/Invalid arguments for write_required/);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("preserves old-style tool results that look like protocol failures", async () => {
    const registry = new ToolRegistry(createDefaultPolicy());
    registry.register({
      name: "legacy_domain_status",
      description: "Return a legacy domain status object",
      capability: "local",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute: () => ({ ok: false, error: "domain status" }),
    });

    await expect(registry.execute("legacy_domain_status", {})).resolves.toEqual({
      ok: false,
      error: "domain status",
    });
  });

  it("keeps createBuiltInTools callable as old-style tools without execution context", async () => {
    const root = await mkdtemp(join(tmpdir(), "corvus-tool-"));
    tempRoots.push(root);
    const filePath = join(root, "readme.txt");
    await writeFile(filePath, "legacy file", "utf8");

    const readFile = createBuiltInTools().find((tool) => tool.name === "read_file");
    expect(readFile).toBeDefined();

    await expect(readFile!.execute({ path: filePath })).resolves.toMatchObject({
      path: filePath,
      content: "legacy file",
      truncated: false,
    });
  });

  it("times out explicit manifests and aborts their execution signal", async () => {
    let observedAbort = false;
    const registry = new ToolRegistry(createDefaultPolicy());
    registry.register(
      createToolManifest({
        name: "wait_forever",
        namespace: "test",
        version: "1.0.0",
        description: "Wait until aborted",
        capability: "local",
        risk: "low",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        timeoutMs: 5,
        outputLimitBytes: 1000,
        concurrency: { perTool: 1, perRun: 1, global: 1 },
        evidencePolicy: "summary",
        resources: [],
        execute: (_input, context) =>
          new Promise((resolve) => {
            context.signal.addEventListener(
              "abort",
              () => {
                observedAbort = true;
                resolve({ ok: false, error: "aborted by signal" });
              },
              { once: true },
            );
          }),
      }),
    );

    await expect(registry.execute("wait_forever", {})).rejects.toThrow(/timed out/i);
    expect(observedAbort).toBe(true);
  });

  it("rejects already-aborted caller signals before executing a manifest", async () => {
    const execute = vi.fn(() => ({ ok: true as const, output: "unreachable" }));
    const controller = new AbortController();
    controller.abort(new Error("caller aborted"));
    const registry = new ToolRegistry(createDefaultPolicy());
    registry.register(
      createToolManifest({
        name: "already_aborted",
        namespace: "test",
        version: "1.0.0",
        description: "Should not execute",
        capability: "local",
        risk: "low",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        timeoutMs: 1000,
        outputLimitBytes: 1000,
        concurrency: { perTool: 1, perRun: 1, global: 1 },
        evidencePolicy: "summary",
        resources: [],
        execute,
      }),
    );

    await expect(registry.execute("already_aborted", {}, { signal: controller.signal })).rejects.toThrow(
      /caller aborted|aborted/i,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects caller aborts during manifests that ignore their signal", async () => {
    const controller = new AbortController();
    const registry = new ToolRegistry(createDefaultPolicy());
    registry.register(
      createToolManifest({
        name: "ignores_abort",
        namespace: "test",
        version: "1.0.0",
        description: "Ignores abort signal",
        capability: "local",
        risk: "low",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        timeoutMs: 1000,
        outputLimitBytes: 1000,
        concurrency: { perTool: 1, perRun: 1, global: 1 },
        evidencePolicy: "summary",
        resources: [],
        execute: () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, output: "late success" }), 50);
          }),
      }),
    );

    const execution = registry.execute("ignores_abort", {}, { signal: controller.signal });
    setTimeout(() => controller.abort(new Error("caller canceled")), 5);

    await expect(execution).rejects.toThrow(/caller canceled|aborted/i);
  });
});
