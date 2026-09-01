import { describe, expect, it } from "vitest";
import { createBuiltInTools, ToolRegistry } from "../src/tools/index.js";
import { createDefaultPolicy } from "../src/permissions.js";

describe("tool registry", () => {
  it("registers OpenAI-compatible tool schemas", () => {
    const registry = new ToolRegistry(createDefaultPolicy());
    registry.registerMany(createBuiltInTools());

    const schemas = registry.toOpenAITools();

    expect(schemas.map((schema) => schema.function.name)).toContain("read_file");
    expect(schemas.every((schema) => schema.type === "function")).toBe(true);
    expect(schemas.find((schema) => schema.function.name === "shell")?.function.parameters.type).toBe("object");
    expect(schemas.map((schema) => schema.function.name)).toEqual(expect.arrayContaining([
      "manage_role", "manage_mcp", "manage_skill", "record_project_memory", "unregister_workspace", "get_workspace_summary", "check_subagent_task",
    ]));
    expect((schemas.find((schema) => schema.function.name === "manage_role")?.function.parameters.properties?.action as { enum?: string[] })?.enum).toEqual(["list", "create", "update", "delete"]);
    expect((schemas.find((schema) => schema.function.name === "manage_mcp")?.function.parameters.properties?.action as { enum?: string[] })?.enum).toEqual(["list", "add", "remove", "test", "import"]);
    expect((schemas.find((schema) => schema.function.name === "record_project_memory")?.function.parameters.properties?.kind as { enum?: string[] })?.enum).toEqual(["architecture", "decision", "pitfall", "convention", "handoff"]);
  });

  it("blocks denied tool calls before execution", async () => {
    const policy = createDefaultPolicy();
    policy.rules["tool:shell"] = "deny";
    const registry = new ToolRegistry(policy);
    registry.registerMany(createBuiltInTools());

    await expect(registry.execute("shell", { command: "node --version" })).rejects.toThrow("denied");
  });

  it("rejects duplicate tools and provides idempotent disposers", async () => {
    const registry = new ToolRegistry(createDefaultPolicy());
    const tool = { name: "temporary", description: "Temporary", capability: "local", parameters: { type: "object", properties: {}, additionalProperties: false } as const, execute: () => "ok" };
    const dispose = registry.register(tool);
    expect(() => registry.register(tool)).toThrow("already registered");
    expect(dispose()).toBe(true); expect(dispose()).toBe(false);
    await expect(registry.execute("temporary", {})).rejects.toThrow("Unknown tool");
  });

  it("rolls back registerMany when a later tool conflicts", () => {
    const registry = new ToolRegistry(createDefaultPolicy()); const base = { description: "x", capability: "local", parameters: { type: "object", properties: {} } as const, execute: () => "ok" };
    registry.register({ ...base, name: "taken" });
    expect(() => registry.registerMany([{ ...base, name: "first" }, { ...base, name: "taken" }])).toThrow();
    expect(registry.list().map(t => t.name)).toEqual(["taken"]);
  });
});
