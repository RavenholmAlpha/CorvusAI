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
  });

  it("blocks denied tool calls before execution", async () => {
    const policy = createDefaultPolicy();
    policy.rules["tool:shell"] = "deny";
    const registry = new ToolRegistry(policy);
    registry.registerMany(createBuiltInTools());

    await expect(registry.execute("shell", { command: "node --version" })).rejects.toThrow("denied");
  });
});
